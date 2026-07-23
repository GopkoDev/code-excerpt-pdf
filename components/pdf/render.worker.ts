/**
 * The PDF worker: the only place pdfkit runs.
 *
 * Deliberately a CLASSIC worker (no `{ type: "module" }`): `importScripts` is
 * the only way to load the UMD standalone bundle, and loading it here keeps
 * 2.4 MB out of Next's build graph and off the main thread. Turbopack
 * transpiles this file into its own chunk plus a bootstrap chunk.
 */

import {
  CODE_FONT,
  CODE_FONT_URL,
  MARGIN,
  TITLE_FONT,
  TITLE_FONT_URL,
} from "@/lib/pdf/constants"
import { measureFile, metricsOf } from "@/lib/pdf/measure"
import { renderPdf } from "@/lib/pdf/render"
import type { WorkerRequest, WorkerResponse } from "@/lib/pdf/worker-protocol"

declare function importScripts(...urls: string[]): void

importScripts("/vendor/pdfkit.standalone.js")

declare const PDFDocument: new (
  options: Record<string, unknown>
) => PDFKit.PDFDocument

let fonts: { code: Uint8Array; title: Uint8Array } | null = null

async function loadFonts() {
  if (fonts) return fonts
  const [code, title] = await Promise.all(
    [CODE_FONT_URL, TITLE_FONT_URL].map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    })
  )
  fonts = { code, title }
  return fonts
}

function createDoc(bufferPages: boolean) {
  const loaded = fonts!
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    // Without this, bufferedPageRange().count is always 1.
    bufferPages,
  })
  doc.registerFont(CODE_FONT, loaded.code as unknown as string)
  doc.registerFont(TITLE_FONT, loaded.title as unknown as string)
  return doc
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  await loadFonts()

  if (request.type === "measure") {
    const doc = createDoc(false)
    return {
      id: request.id,
      type: "measured",
      files: request.files.map((file) =>
        measureFile(doc, file.name, file.text)
      ),
      metrics: metricsOf(doc),
    }
  }

  const result = await renderPdf(() => createDoc(true), request.files)
  return {
    id: request.id,
    type: "rendered",
    blob: result.blob,
    pageCount: result.pageCount,
    files: result.files,
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  handle(event.data).then(
    (response) => self.postMessage(response),
    (error: unknown) =>
      self.postMessage({
        id: event.data.id,
        type: "failed",
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse)
  )
})
