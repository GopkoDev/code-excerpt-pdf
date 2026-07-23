import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import PDFDocument from "pdfkit"
import { beforeAll, describe, expect, it } from "vitest"

import { CODE_FONT, MARGIN, TITLE_FONT } from "@/lib/pdf/constants"
import { estimateLines, estimatePages } from "@/lib/pdf/estimate"
import {
  measureFile,
  metricsOf,
  paginate,
  type Metrics,
} from "@/lib/pdf/measure"

const FONT_DIR = join(process.cwd(), "public/fonts")

function newDoc() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  })
  doc.registerFont(CODE_FONT, join(FONT_DIR, "JetBrainsMono-Regular.ttf"))
  doc.registerFont(TITLE_FONT, join(FONT_DIR, "JetBrainsMono-Bold.ttf"))
  return doc
}

/** This repository's own source, walked fresh — so the corpus grows with it. */
function corpusPaths(dir: string, acc: string[] = []): string[] {
  for (const item of readdirSync(join(process.cwd(), dir))) {
    const relative = `${dir}/${item}`
    const stats = statSync(join(process.cwd(), relative))
    if (stats.isDirectory()) corpusPaths(relative, acc)
    else if (/\.(ts|tsx|mjs|cjs|css|json|md)$/.test(item) && stats.size > 0) {
      acc.push(relative)
    }
  }
  return acc
}

describe("estimateLines", () => {
  it("is zero for an empty file", () => {
    expect(estimateLines(0)).toBe(0)
  })

  it("rounds up — a partial line still occupies a line", () => {
    expect(estimateLines(1)).toBe(1)
  })

  it("never shrinks as the file grows", () => {
    let previous = 0
    for (let bytes = 0; bytes < 20_000; bytes += 137) {
      const lines = estimateLines(bytes)
      expect(lines).toBeGreaterThanOrEqual(previous)
      previous = lines
    }
  })
})

describe("estimatePages", () => {
  let metrics: Metrics

  beforeAll(() => {
    metrics = metricsOf(newDoc())
  })

  it("is at least one page for any file — the title alone occupies one", () => {
    expect(estimatePages(0, metrics)).toBeGreaterThanOrEqual(1)
    expect(estimatePages(10, metrics)).toBeGreaterThanOrEqual(1)
  })

  it("never shrinks as the file grows", () => {
    let previous = 0
    for (let bytes = 0; bytes < 200_000; bytes += 1_111) {
      const pages = estimatePages(bytes, metrics)
      expect(pages).toBeGreaterThanOrEqual(previous)
      previous = pages
    }
  })

  /**
   * THE calibration test, and the reason the estimator exists at all.
   *
   * In GitHub mode the tree shows page counts before any blob is fetched, so
   * the number comes from `size` alone. SPEC requires the bias run one way:
   * over-estimating merely makes the user add another file, while
   * under-estimating costs them a whole generate → too-few-pages → regenerate
   * cycle. Tolerance is one page.
   */
  it("never under-estimates a real file by more than one page", () => {
    const doc = newDoc()
    const paths = [
      ...corpusPaths("lib"),
      ...corpusPaths("app"),
      ...corpusPaths("components"),
      ...corpusPaths("hooks"),
      ...corpusPaths("scripts"),
    ]
    expect(paths.length).toBeGreaterThan(15)

    const offenders: string[] = []
    for (const path of paths) {
      const text = readFileSync(join(process.cwd(), path), "utf8")
      const sizeBytes = statSync(join(process.cwd(), path)).size
      const exact = paginate(
        [measureFile(doc, path.split("/").pop()!, text)],
        metrics
      )
      const estimated = estimatePages(sizeBytes, metrics)
      if (estimated < exact - 1) {
        offenders.push(`${path}: estimated ${estimated}, exact ${exact}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it("leans high on average, as the bias requires", () => {
    const doc = newDoc()
    const paths = corpusPaths("lib")
    const diffs = paths.map((path) => {
      const text = readFileSync(join(process.cwd(), path), "utf8")
      const exact = paginate(
        [measureFile(doc, path.split("/").pop()!, text)],
        metrics
      )
      return (
        estimatePages(statSync(join(process.cwd(), path)).size, metrics) - exact
      )
    })
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
    expect(mean).toBeGreaterThan(0)
  })

  it("over-estimates non-ASCII, which costs two bytes per column", () => {
    // Cyrillic is 2 bytes per character in UTF-8 but one column wide, so a
    // byte-based estimate errs high — the safe direction.
    const cyrillic = "// Привіт, світ\n".repeat(200)
    const bytes = new TextEncoder().encode(cyrillic).length
    const exact = paginate([measureFile(newDoc(), "укр.ts", cyrillic)], metrics)
    expect(estimatePages(bytes, metrics)).toBeGreaterThanOrEqual(exact)
  })
})
