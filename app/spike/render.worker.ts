/**
 * SLICE 0 SPIKE — throwaway. Deleted once slice 1 lands a real renderer.
 *
 * Proves, in a real browser, that:
 *  1. pdfkit.standalone.js loads in a Web Worker from /vendor/ with an empty
 *     next.config.ts
 *  2. the embedded font measures Cyrillic with real (non-zero) width
 *  3. the arithmetic paginator equals doc.bufferedPageRange().count
 *  4. chunks collected via doc.on("data") make a valid Blob — no blob-stream,
 *     which would drag in a Node stream shim Turbopack will not polyfill
 */

import {
  CODE_FONT,
  CODE_LINE_GAP,
  CODE_FONT_URL,
  CODE_SIZE,
  CONTENT_WIDTH,
  MARGIN,
  TEXT_FEATURES,
  TITLE_FONT,
  TITLE_FONT_URL,
  TITLE_LINE_GAP,
  TITLE_SIZE,
} from "@/lib/pdf/constants"
import {
  countCodeLines,
  measureFile,
  metricsOf,
  normalizeCode,
  paginate,
} from "@/lib/pdf/measure"

declare function importScripts(...urls: string[]): void

/**
 * A classic (non-module) worker, deliberately: `importScripts` is the only way
 * to load the UMD standalone bundle, and it keeps 2.4 MB out of Next's build
 * graph and off the main thread. The bundle assigns `self.PDFDocument`.
 */
importScripts("/vendor/pdfkit.standalone.js")

declare const PDFDocument: new (
  options: Record<string, unknown>
) => PDFKit.PDFDocument

export type SpikeReport = {
  ok: boolean
  checks: { label: string; pass: boolean; detail: string }[]
  error?: string
}

const SAMPLES: { name: string; code: string }[] = [
  { name: "ascii.ts", code: "const a = 1\nconst b = 2\n" },
  {
    name: "ligatures.ts",
    code: "// comment\nif (a !== b && c <= d) return a => a === b\n",
  },
  {
    name: "українська.ts",
    code: "// Це коментар українською, з Ї, Є, Ґ та ё\nconst привіт = 'світ'\n",
  },
  { name: "minified.js", code: `${"a".repeat(5000)}\n` },
  { name: "crlf.ts", code: "const a = 1\r\nconst b = 2\r\n" },
  { name: "tabs.ts", code: "function f() {\n\treturn 1\n}\n" },
  { name: "no-newline.ts", code: "const last = true" },
  {
    name: "bulk.ts",
    code: Array.from(
      { length: 3000 },
      (_, n) => `const value${n} = ${"z".repeat(n % 40)}`
    ).join("\n"),
  },
]

async function loadFont(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

function newDoc(
  fonts: { code: Uint8Array; title: Uint8Array },
  buffer = false
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: buffer,
  })
  doc.registerFont(CODE_FONT, fonts.code as unknown as string)
  doc.registerFont(TITLE_FONT, fonts.title as unknown as string)
  return doc
}

async function run(): Promise<SpikeReport> {
  const checks: SpikeReport["checks"] = []
  const add = (label: string, pass: boolean, detail: string) =>
    checks.push({ label, pass, detail })

  add(
    "pdfkit.standalone.js loaded in worker",
    typeof PDFDocument === "function",
    typeof PDFDocument
  )

  const fonts = {
    code: await loadFont(CODE_FONT_URL),
    title: await loadFont(TITLE_FONT_URL),
  }
  add(
    "fonts fetched from /fonts/",
    fonts.code.length > 0 && fonts.title.length > 0,
    `regular ${fonts.code.length}B, bold ${fonts.title.length}B`
  )

  const measureDoc = newDoc(fonts)

  // The bug the embedded font exists to prevent: a WinAnsi font measures
  // Cyrillic as 0pt, so a long Cyrillic line never wraps.
  measureDoc.font(CODE_FONT).fontSize(CODE_SIZE)
  const cyrWidth = measureDoc.widthOfString("привіт", {
    features: TEXT_FEATURES,
  })
  add(
    "Cyrillic has non-zero measured width",
    cyrWidth > 0,
    `widthOfString("привіт") = ${cyrWidth.toFixed(2)}pt`
  )
  const latWidth = measureDoc.widthOfString("privit", {
    features: TEXT_FEATURES,
  })
  add(
    "Cyrillic and Latin measure identically (monospaced)",
    Math.abs(cyrWidth - latWidth) < 0.001,
    `${cyrWidth.toFixed(2)} vs ${latWidth.toFixed(2)}`
  )

  const nonInteger = SAMPLES.filter((s) => {
    const n = countCodeLines(measureDoc, normalizeCode(s.code))
    return !Number.isInteger(n)
  })
  add(
    "every sample yields a whole number of lines",
    nonInteger.length === 0,
    nonInteger.length === 0
      ? `${SAMPLES.length} samples`
      : nonInteger.map((s) => s.name).join(", ")
  )

  const measured = SAMPLES.map((s) => measureFile(measureDoc, s.name, s.code))
  const predicted = paginate(measured, metricsOf(measureDoc))

  // Render for real, collecting chunks — no blob-stream.
  const doc = newDoc(fonts, true)
  const chunks: BlobPart[] = []
  const blob = await new Promise<Blob>((resolve, reject) => {
    // pdfkit's shimmed stream hands back Uint8Array<ArrayBufferLike>; Blob
    // wants Uint8Array<ArrayBuffer>. The buffer is never shared here.
    doc.on("data", (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk))
    doc.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })))
    doc.on("error", reject)

    SAMPLES.forEach((file, index) => {
      if (index > 0) doc.moveDown(1.5)
      doc.font(TITLE_FONT).fontSize(TITLE_SIZE).text(file.name, {
        lineGap: TITLE_LINE_GAP,
        width: CONTENT_WIDTH,
        features: TEXT_FEATURES,
      })
      doc.moveDown(0.8)
      doc.font(CODE_FONT).fontSize(CODE_SIZE).text(normalizeCode(file.code), {
        lineGap: CODE_LINE_GAP,
        width: CONTENT_WIDTH,
        features: TEXT_FEATURES,
      })
    })

    const actual = doc.bufferedPageRange().count
    add(
      "arithmetic paginator equals bufferedPageRange().count",
      predicted === actual,
      `predicted ${predicted}, actual ${actual}`
    )
    doc.end()
  })

  add(
    "Blob assembled from doc.on('data') chunks",
    blob.size > 0,
    `${chunks.length} chunks, ${blob.size}B`
  )

  const header = new TextDecoder().decode(
    new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  )
  add("output is a real PDF", header === "%PDF-", JSON.stringify(header))

  return { ok: checks.every((c) => c.pass), checks }
}

self.addEventListener("message", () => {
  run().then(
    (report) => self.postMessage(report),
    (error: unknown) =>
      self.postMessage({
        ok: false,
        checks: [],
        error: error instanceof Error ? error.stack : String(error),
      } satisfies SpikeReport)
  )
})
