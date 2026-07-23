import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Writable } from "node:stream"

import PDFDocument from "pdfkit"
import { beforeAll, describe, expect, it } from "vitest"

import {
  CODE_FONT,
  CODE_LINE_GAP,
  CODE_SIZE,
  CONTENT_WIDTH,
  MARGIN,
  TEXT_FEATURES,
  TITLE_FONT,
} from "@/lib/pdf/constants"
import {
  countCodeLines,
  measureFile,
  metricsOf,
  normalizeCode,
  paginate,
} from "@/lib/pdf/measure"

const FONT_DIR = join(process.cwd(), "public/fonts")

function newDoc(bufferPages = false) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    // Without this, _pageBuffer is flushed as it goes and bufferedPageRange()
    // always reports 1 — the ground truth would be silently wrong.
    bufferPages,
  })
  doc.registerFont(CODE_FONT, join(FONT_DIR, "JetBrainsMono-Regular.ttf"))
  doc.registerFont(TITLE_FONT, join(FONT_DIR, "JetBrainsMono-Bold.ttf"))
  return doc
}

/** The corpus SPEC §5 requires: wrapping, minified, CRLF, tabs, no trailing
 * newline, and non-ASCII. */
const CORPUS: Record<string, string> = {
  "short.ts": "const a = 1\nconst b = 2\n",
  "wrapping.ts": `const x = "${"y".repeat(200)}"\nconst z = 3\n`,
  "minified.js": `${"a".repeat(5000)}\n`,
  "crlf.ts": "const a = 1\r\nconst b = 2\r\nconst c = 3\r\n",
  "tabs.ts": "function f() {\n\treturn {\n\t\ta: 1,\n\t}\n}\n",
  "no-trailing-newline.ts": "const last = true",
  "cyrillic.ts":
    "// Це коментар українською, з Ї, Є, Ґ та ё\nconst привіт = 'світ'\n",
  "cyrillic-long.ts": `// ${"перевірка переносу рядка ".repeat(20)}\n`,
  "blank-lines.ts": "const a = 1\n\n\n\nconst b = 2\n",
  "empty.ts": "",
  // Every one of these pairs is a JetBrains Mono `calt` ligature, and every
  // one throws inside fontkit unless TEXT_FEATURES disables them.
  "ligatures.ts":
    "// comment\nif (a !== b && c <= d) return a => a === b\n/* -> <- >= != */\n",
}

describe("normalizeCode", () => {
  it("replaces tabs with two spaces, matching generate.cjs", () => {
    expect(normalizeCode("\tif (x) {\n\t\ty()\n\t}")).toBe(
      "  if (x) {\n    y()\n  }"
    )
  })

  it("normalizes CRLF to LF so \\r never reaches the renderer", () => {
    expect(normalizeCode("a\r\nb\r\n")).toBe("a\nb\n")
  })

  it("normalizes a lone CR", () => {
    expect(normalizeCode("a\rb")).toBe("a\nb")
  })
})

describe("countCodeLines", () => {
  let doc: PDFKit.PDFDocument

  beforeAll(() => {
    doc = newDoc()
  })

  it.each(Object.keys(CORPUS))(
    "returns a whole number of lines for %s",
    (name) => {
      const lines = countCodeLines(doc, normalizeCode(CORPUS[name]))
      expect(Number.isInteger(lines)).toBe(true)
      expect(lines).toBeGreaterThanOrEqual(0)
    }
  )

  it("counts one line per short source line", () => {
    expect(countCodeLines(doc, "a\nb\nc\n")).toBe(3)
  })

  it("counts a wrapped long line as more than one line", () => {
    const perLine = Math.floor(CONTENT_WIDTH / (CODE_SIZE * 0.6))
    expect(countCodeLines(doc, `${"x".repeat(perLine * 3)}\n`)).toBeGreaterThan(
      1
    )
  })

  it("measures Cyrillic with real width — it must not collapse to one line", () => {
    // The bug this whole font decision exists to prevent: WinAnsi fonts
    // measure non-ASCII as 0pt, so a long Cyrillic line never wraps.
    const long = "ц".repeat(500)
    expect(countCodeLines(doc, `${long}\n`)).toBeGreaterThan(1)
  })

  it("gives Cyrillic and Latin the same count — the font is monospaced", () => {
    const latin = "a".repeat(500)
    const cyrillic = "ц".repeat(500)
    expect(countCodeLines(doc, `${cyrillic}\n`)).toBe(
      countCodeLines(doc, `${latin}\n`)
    )
  })

  it("is deterministic across documents", () => {
    const text = normalizeCode(CORPUS["wrapping.ts"])
    expect(countCodeLines(newDoc(), text)).toBe(countCodeLines(newDoc(), text))
  })
})

describe("metricsOf", () => {
  it("derives a line advance that includes the configured lineGap", () => {
    const doc = newDoc()
    const { code } = metricsOf(doc)
    expect(code.advance).toBeCloseTo(code.lineHeight + CODE_LINE_GAP, 10)
  })
})

/**
 * The test that justifies the whole spike: the arithmetic paginator must agree
 * with pdfkit's own page count, so the running total shown before export equals
 * the exported PDF exactly (SPEC acceptance criteria).
 */
describe("paginate", () => {
  function renderAndCount(files: { name: string; code: string }[]) {
    const doc = newDoc(true)
    // Discard the bytes — we only want the page count.
    doc.pipe(new Writable({ write: (_chunk, _enc, cb) => cb() }))
    files.forEach((file, index) => {
      if (index > 0) doc.moveDown(1.5)
      doc.font(TITLE_FONT).fontSize(13).text(file.name, {
        lineGap: 4,
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
    doc.end()
    return actual
  }

  function predict(files: { name: string; code: string }[]) {
    const doc = newDoc()
    const measured = files.map((f) => measureFile(doc, f.name, f.code))
    return paginate(measured, metricsOf(doc))
  }

  const cases: { label: string; files: { name: string; code: string }[] }[] = [
    {
      label: "a single short file",
      files: [{ name: "a.ts", code: "const a = 1\n" }],
    },
    {
      label: "the whole corpus",
      files: Object.entries(CORPUS).map(([name, code]) => ({ name, code })),
    },
    {
      label: "a file that exactly fills a page",
      files: [{ name: "fill.ts", code: "x\n".repeat(69) }],
    },
    {
      label: "page-boundary sweep",
      files: Array.from({ length: 12 }, (_, i) => ({
        name: `b${i}.ts`,
        code: "y\n".repeat(60 + i),
      })),
    },
    {
      label: "~10,000 lines across many files",
      files: Array.from({ length: 40 }, (_, i) => ({
        name: `file-${String(i).padStart(3, "0")}.ts`,
        code: Array.from(
          { length: 250 },
          (_, n) => `const value${n} = ${"z".repeat(n % 40)}`
        ).join("\n"),
      })),
    },
    {
      label: "Cyrillic-heavy selection",
      files: Array.from({ length: 10 }, (_, i) => ({
        name: `укр-${i}.ts`,
        code: Array.from(
          { length: 200 },
          (_, n) => `// рядок ${n} з українським текстом`
        ).join("\n"),
      })),
    },
  ]

  it.each(cases)("matches pdfkit's own page count for $label", ({ files }) => {
    expect(predict(files)).toBe(renderAndCount(files))
  })

  it("matches for every real .ts/.tsx file in this repo", () => {
    const paths = [
      "lib/utils.ts",
      "lib/pdf/constants.ts",
      "app/layout.tsx",
      "app/page.tsx",
      "components/theme-provider.tsx",
      "components/ui/button.tsx",
    ]
    const files = paths.map((p) => ({
      name: p.split("/").pop()!,
      code: readFileSync(join(process.cwd(), p), "utf8"),
    }))
    expect(predict(files)).toBe(renderAndCount(files))
  })
})
