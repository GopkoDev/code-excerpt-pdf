/**
 * PDF rendering — the single place the visual contract is drawn.
 *
 * `lib/pdf/measure.ts` predicts; this draws. They must never drift, so the
 * measurement test validates its paginator against `drawFiles` here rather
 * than against its own copy of the flow.
 *
 * Nothing here imports pdfkit: the document is injected, so the same code runs
 * in the Web Worker (where PDFDocument is a global from the standalone build)
 * and in Vitest under Node.
 */

import {
  CODE_FONT,
  CODE_LINE_GAP,
  CODE_SIZE,
  CONTENT_WIDTH,
  GAP_AFTER_TITLE,
  GAP_BETWEEN_FILES,
  TEXT_FEATURES,
  TITLE_FONT,
  TITLE_LINE_GAP,
  TITLE_SIZE,
} from "./constants"
import { countCodeLines, normalizeCode } from "./measure"
import { sha256Hex } from "../uniqueness/hash"

export type SourceFile = {
  name: string
  /** Raw bytes, as uploaded — what gets hashed. */
  bytes: Uint8Array
  /** Decoded text, from lib/files/decode.ts. */
  text: string
}

export type RenderedFile = {
  name: string
  contentHash: string
  sizeBytes: number
  lines: number
}

export type RenderResult = {
  blob: Blob
  /** From the very document these bytes came out of — never a second run. */
  pageCount: number
  files: RenderedFile[]
}

export type DocumentFactory = () => PDFKit.PDFDocument

/**
 * A cache key identifying exactly what a render would contain.
 *
 * This is what lets one render serve both the preview and the download, which
 * the plan requires: two renders mean two page counts free to disagree. A
 * collision would be worse than no cache at all — the user would preview one
 * document and download another — so name and byte length are both included,
 * and separated by characters that cannot occur in a filename.
 */
export function selectionSignature(files: SourceFile[]): string {
  const UNIT = "\u0000"
  return files
    .map((file) =>
      [file.name, file.bytes.length, checksum(file.bytes)].join(UNIT)
    )
    .sort()
    .join("\u0001")
}

/**
 * FNV-1a over the raw bytes.
 *
 * Name and length alone are not enough: two different one-character edits keep
 * both. This is a *cache* key, not a ledger entry — `sha256Hex` remains the
 * hash that records what was exported. FNV is used because it is synchronous
 * and cheap, which `crypto.subtle` is not.
 */
function checksum(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Alphabetical by UTF-16 code unit — the same ordering `generate.cjs` gets
 * from a bare `Array.prototype.sort`. Deliberately not `localeCompare`, whose
 * result depends on the ambient locale and would make page counts vary
 * between machines.
 */
function alphabetically<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )
}

/**
 * Draws the selection as one continuous flow: no per-file page break, no page
 * numbers. Mirrors `generate.cjs` exactly — see lib/pdf/constants.ts.
 */
export function drawFiles(
  doc: PDFKit.PDFDocument,
  files: { name: string; text: string }[]
): void {
  files.forEach((file, index) => {
    if (index > 0) doc.moveDown(GAP_BETWEEN_FILES)

    doc.font(TITLE_FONT).fontSize(TITLE_SIZE).text(file.name, {
      lineGap: TITLE_LINE_GAP,
      width: CONTENT_WIDTH,
      features: TEXT_FEATURES,
    })

    doc.moveDown(GAP_AFTER_TITLE)

    doc.font(CODE_FONT).fontSize(CODE_SIZE).text(normalizeCode(file.text), {
      lineGap: CODE_LINE_GAP,
      width: CONTENT_WIDTH,
      features: TEXT_FEATURES,
    })
  })
}

/**
 * Renders a selection into a downloadable Blob in ONE pass, returning the page
 * count of that same pass. Never compute `actualPages` from a second render:
 * the recorded count would be free to drift from the PDF the user downloaded.
 */
export async function renderPdf(
  createDoc: DocumentFactory,
  files: SourceFile[]
): Promise<RenderResult> {
  if (files.length === 0) {
    throw new Error("Cannot export: no files selected.")
  }

  const doc = createDoc()

  // bufferedPageRange().count reports 1 unless the document buffers its pages,
  // which would under-report every export. Fail loudly rather than silently.
  if (!doc.options.bufferPages) {
    throw new Error(
      "The document must be created with bufferPages: true, otherwise the page count is always 1."
    )
  }

  const ordered = alphabetically(files)

  // Measure before drawing: heightOfString restores x/y, but the document is
  // no longer safe to query once it has been ended.
  const lineCounts = ordered.map((file) =>
    countCodeLines(doc, normalizeCode(file.text))
  )

  let pageCount = 0
  const chunks: BlobPart[] = []
  const blob = await new Promise<Blob>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk))
    doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })))
    doc.on("error", reject)

    try {
      drawFiles(doc, ordered)
      pageCount = doc.bufferedPageRange().count
      doc.end()
    } catch (error) {
      reject(error)
    }
  })

  const rendered = await Promise.all(
    ordered.map(async (file, index) => ({
      name: file.name,
      // Hash the RAW bytes, before normalization — see lib/uniqueness/hash.ts.
      contentHash: await sha256Hex(file.bytes),
      sizeBytes: file.bytes.length,
      lines: lineCounts[index],
    }))
  )

  return { blob, pageCount, files: rendered }
}
