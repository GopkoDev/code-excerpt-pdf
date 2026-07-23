import { join } from "node:path"

import PDFDocument from "pdfkit"
import { describe, expect, it } from "vitest"

import { CODE_FONT, MARGIN, TITLE_FONT } from "@/lib/pdf/constants"
import { measureFile, metricsOf, paginate } from "@/lib/pdf/measure"
import {
  renderPdf,
  selectionSignature,
  type SourceFile,
} from "@/lib/pdf/render"
import { sha256Hex } from "@/lib/uniqueness/hash"

const FONT_DIR = join(process.cwd(), "public/fonts")

function createDoc(bufferPages = true) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages,
  })
  doc.registerFont(CODE_FONT, join(FONT_DIR, "JetBrainsMono-Regular.ttf"))
  doc.registerFont(TITLE_FONT, join(FONT_DIR, "JetBrainsMono-Bold.ttf"))
  return doc
}

function sourceFile(name: string, text: string): SourceFile {
  return { name, bytes: new TextEncoder().encode(text), text }
}

const FIXTURE: SourceFile[] = [
  sourceFile("zebra.ts", "const z = 1\nconst zz = 2\n"),
  sourceFile("alpha.ts", "// Привіт\nconst a = () => a !== b\n"),
  sourceFile("middle.ts", `${"const m = 1\n".repeat(120)}`),
]

describe("renderPdf", () => {
  it("produces a real PDF", async () => {
    const { blob } = await renderPdf(() => createDoc(), FIXTURE)
    const header = new TextDecoder().decode(
      new Uint8Array(await blob.slice(0, 5).arrayBuffer())
    )
    expect(header).toBe("%PDF-")
    expect(blob.type).toBe("application/pdf")
    expect(blob.size).toBeGreaterThan(0)
  })

  it("emits files alphabetically regardless of input order", async () => {
    const { files } = await renderPdf(() => createDoc(), FIXTURE)
    expect(files.map((f) => f.name)).toEqual([
      "alpha.ts",
      "middle.ts",
      "zebra.ts",
    ])
  })

  it("reports one entry per input file", async () => {
    const { files } = await renderPdf(() => createDoc(), FIXTURE)
    expect(files).toHaveLength(FIXTURE.length)
  })

  it("hashes the raw bytes, not the normalized text", async () => {
    const withTab = sourceFile("tabs.ts", "\tconst a = 1\n")
    const { files } = await renderPdf(() => createDoc(), [withTab])
    expect(files[0].contentHash).toBe(await sha256Hex(withTab.bytes))
  })

  it("records the raw byte length", async () => {
    const { files } = await renderPdf(() => createDoc(), FIXTURE)
    const alpha = files.find((f) => f.name === "alpha.ts")!
    const source = FIXTURE.find((f) => f.name === "alpha.ts")!
    expect(alpha.sizeBytes).toBe(source.bytes.length)
  })

  /**
   * The rule the plan calls out: actualPages must come from the run that
   * produced the downloaded bytes. If pageCount were computed by a second
   * render, the recorded count could silently drift from the PDF the user
   * actually emailed.
   */
  it("reports the page count of the very document it streamed", async () => {
    const { blob, pageCount } = await renderPdf(() => createDoc(), FIXTURE)
    const text = new TextDecoder("latin1").decode(
      new Uint8Array(await blob.arrayBuffer())
    )
    const pageObjects = text.match(/\/Type\s*\/Page[^s]/g) ?? []
    expect(pageObjects).toHaveLength(pageCount)
  })

  it("agrees with the arithmetic paginator shown as the running total", async () => {
    const { pageCount } = await renderPdf(() => createDoc(), FIXTURE)

    const measureDoc = createDoc(false)
    const predicted = paginate(
      [...FIXTURE]
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((f) => measureFile(measureDoc, f.name, f.text)),
      metricsOf(measureDoc)
    )
    expect(pageCount).toBe(predicted)
  })

  it("is deterministic across runs for a fixed fixture", async () => {
    const first = await renderPdf(() => createDoc(), FIXTURE)
    const second = await renderPdf(() => createDoc(), FIXTURE)
    expect(second.pageCount).toBe(first.pageCount)
    expect(second.files).toEqual(first.files)
  })

  it("counts lines per file", async () => {
    const { files } = await renderPdf(
      () => createDoc(),
      [sourceFile("three.ts", "a\nb\nc\n")]
    )
    expect(files[0].lines).toBe(3)
  })

  /**
   * bufferedPageRange().count silently returns 1 without bufferPages, which
   * would make every export under-report its length. Fail loudly instead.
   */
  it("refuses a document created without bufferPages", async () => {
    await expect(renderPdf(() => createDoc(false), FIXTURE)).rejects.toThrow(
      /bufferPages/
    )
  })

  it("refuses an empty selection", async () => {
    await expect(renderPdf(() => createDoc(), [])).rejects.toThrow(/no files/i)
  })
})

/**
 * The cache key that lets one render serve both the preview and the download.
 * If it ever collides across different selections, the user previews one
 * document and downloads another.
 */
describe("selectionSignature", () => {
  const f = (name: string, text: string) => sourceFile(name, text)

  it("is stable for the same selection", () => {
    const files = [f("a.ts", "x"), f("b.ts", "y")]
    expect(selectionSignature(files)).toBe(selectionSignature(files))
  })

  it("ignores the order files arrive in", () => {
    expect(selectionSignature([f("a.ts", "x"), f("b.ts", "y")])).toBe(
      selectionSignature([f("b.ts", "y"), f("a.ts", "x")])
    )
  })

  it("changes when a file is added", () => {
    expect(selectionSignature([f("a.ts", "x")])).not.toBe(
      selectionSignature([f("a.ts", "x"), f("b.ts", "y")])
    )
  })

  it("changes when a file is removed", () => {
    expect(selectionSignature([f("a.ts", "x"), f("b.ts", "y")])).not.toBe(
      selectionSignature([f("b.ts", "y")])
    )
  })

  it("changes when content changes under the same name", () => {
    expect(selectionSignature([f("a.ts", "one")])).not.toBe(
      selectionSignature([f("a.ts", "two")])
    )
  })

  it("distinguishes two files whose names concatenate ambiguously", () => {
    expect(selectionSignature([f("ab.ts", "x"), f("c.ts", "y")])).not.toBe(
      selectionSignature([f("a.ts", "x"), f("bc.ts", "y")])
    )
  })

  it("is empty-safe", () => {
    expect(typeof selectionSignature([])).toBe("string")
  })
})
