/**
 * Exact page measurement.
 *
 * Two tiers, per SPEC §3:
 *  - content in hand  → exact line count via pdfkit's real line wrapper, once
 *                       per file, cached next to the contentHash
 *  - selection change → pure arithmetic over those cached counts, never a
 *                       re-render
 *
 * Nothing here imports pdfkit: the document is injected, so the same code runs
 * in the Web Worker (where PDFDocument is a global from the standalone build)
 * and in Vitest under Node.
 */

import {
  CODE_FONT,
  CODE_LINE_GAP,
  CODE_SIZE,
  CONTENT_MAX_Y,
  CONTENT_TOP,
  CONTENT_WIDTH,
  GAP_AFTER_TITLE,
  GAP_BETWEEN_FILES,
  TAB_REPLACEMENT,
  TEXT_FEATURES,
  TITLE_FONT,
  TITLE_LINE_GAP,
  TITLE_SIZE,
} from "./constants"

export type LineMetrics = {
  /** pdfkit's `currentLineHeight(true)` — what the page-break check uses. */
  lineHeight: number
  /** What each emitted line actually advances y by: lineHeight + lineGap. */
  advance: number
}

export type Metrics = { code: LineMetrics; title: LineMetrics }

export type MeasuredFile = {
  name: string
  titleLines: number
  codeLines: number
}

/**
 * `generate.cjs` renders tabs as two spaces. CRLF is normalized too, so a
 * stray \r never reaches the renderer as a glyph.
 *
 * Content hashing happens on the RAW bytes, before this runs — hashing the
 * transformed text would invalidate every stored hash on any future
 * whitespace tweak and resurrect already-used files.
 */
export function normalizeCode(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\t/g, TAB_REPLACEMENT)
}

function lineMetrics(
  doc: PDFKit.PDFDocument,
  font: string,
  size: number,
  lineGap: number
): LineMetrics {
  doc.font(font).fontSize(size)
  const lineHeight = doc.currentLineHeight(true)
  return { lineHeight, advance: lineHeight + lineGap }
}

export function metricsOf(doc: PDFKit.PDFDocument): Metrics {
  return {
    code: lineMetrics(doc, CODE_FONT, CODE_SIZE, CODE_LINE_GAP),
    title: lineMetrics(doc, TITLE_FONT, TITLE_SIZE, TITLE_LINE_GAP),
  }
}

/**
 * Runs pdfkit's real LineWrapper without emitting to the stream and without
 * page-breaking (heightOfString forces height = Infinity, which pins maxY to
 * Infinity so no break ever fires). Every emitted line advances y by exactly
 * `advance`, so the division is an exact integer.
 */
function countLines(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  size: number,
  lineGap: number,
  advance: number
): number {
  if (text === "") return 0
  doc.font(font).fontSize(size)
  const height = doc.heightOfString(text, {
    width: CONTENT_WIDTH,
    lineGap,
    features: TEXT_FEATURES,
  })
  return Math.round(height / advance)
}

export function countCodeLines(doc: PDFKit.PDFDocument, text: string): number {
  const { code } = metricsOf(doc)
  return countLines(
    doc,
    text,
    CODE_FONT,
    CODE_SIZE,
    CODE_LINE_GAP,
    code.advance
  )
}

export function countTitleLines(doc: PDFKit.PDFDocument, name: string): number {
  const { title } = metricsOf(doc)
  return countLines(
    doc,
    name,
    TITLE_FONT,
    TITLE_SIZE,
    TITLE_LINE_GAP,
    title.advance
  )
}

export function measureFile(
  doc: PDFKit.PDFDocument,
  name: string,
  rawCode: string
): MeasuredFile {
  return {
    name,
    titleLines: countTitleLines(doc, name),
    codeLines: countCodeLines(doc, normalizeCode(rawCode)),
  }
}

/**
 * Mirrors pdfkit's LineWrapper. The asymmetry that makes a naive simulator
 * off by a page: a line ADVANCES y by lineHeight + lineGap, but the
 * page-break check compares against lineHeight ALONE (see LineWrapper's
 * `if (PDFNumber(document.y + lh) > this.maxY)`, where lh is
 * `currentLineHeight(true)` — no gap). Math.fround reproduces PDFNumber's
 * float32 narrowing so boundary cases land on the same side.
 */
class Cursor {
  y = CONTENT_TOP
  pages = 1

  private break() {
    this.pages += 1
    this.y = CONTENT_TOP
  }

  private overflows(lineHeight: number) {
    return Math.fround(this.y + lineHeight) > CONTENT_MAX_Y
  }

  /** `doc.moveDown(n)` — advances by whole line heights of the current font. */
  moveDown(lines: number, m: LineMetrics) {
    this.y += m.lineHeight * lines
  }

  /** One `doc.text()` call producing `lines` wrapped lines. */
  flow(lines: number, m: LineMetrics) {
    if (lines === 0) return
    // LineWrapper's pre-check, before the first line is emitted.
    if (this.y > CONTENT_MAX_Y || this.overflows(m.lineHeight)) this.break()
    for (let i = 0; i < lines; i++) {
      this.y += m.advance
      // The check runs after each emitted line except the final one: that one
      // is emitted after the word loop ends, with no check behind it.
      if (i < lines - 1 && this.overflows(m.lineHeight)) this.break()
    }
  }
}

/**
 * Predicted page count for a selection, by arithmetic alone. Mirrors the flow
 * in generate.cjs: alphabetical, one continuous stream, no per-file page
 * break.
 */
export function paginate(files: MeasuredFile[], metrics: Metrics): number {
  if (files.length === 0) return 1
  const cursor = new Cursor()
  files.forEach((file, index) => {
    // moveDown(1.5) runs while the CODE font is still current.
    if (index > 0) cursor.moveDown(GAP_BETWEEN_FILES, metrics.code)
    cursor.flow(file.titleLines, metrics.title)
    // moveDown(0.8) runs while the TITLE font is current.
    cursor.moveDown(GAP_AFTER_TITLE, metrics.title)
    cursor.flow(file.codeLines, metrics.code)
  })
  return cursor.pages
}
