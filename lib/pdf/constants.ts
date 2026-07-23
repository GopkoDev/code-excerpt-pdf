/**
 * The entire visual contract of the exported PDF, in one file.
 *
 * SPEC §6 makes changing the PDF *geometry* an ask-first action, so it all
 * lives here to make any such diff obvious. `generate.cjs` is the reference:
 * A4, 60pt margins, 9pt code, 13pt bold filename titles, lineGap 2,
 * alphabetical order, one continuous flow — no per-file page break, no page
 * numbers.
 *
 * Approved exception (SPEC §6): the typeface differs from the reference.
 * pdfkit's standard Courier/Helvetica are WinAnsi-only — any character outside
 * it maps to .notdef AND measures 0pt wide, so a Cyrillic line renders as
 * garbage and never wraps, corrupting the page count. We embed a Unicode
 * monospace family instead. Metrics therefore differ, so pagination will NOT
 * match the reference; only geometry does. Do not "restore fidelity" by
 * reverting the font.
 */

/** pdfkit's A4, in points. */
export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89

export const MARGIN = 60

/** Where text starts on a fresh page, and the y beyond which it may not go. */
export const CONTENT_TOP = MARGIN
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
/** pdfkit's `page.maxY()` — height minus the bottom margin. */
export const CONTENT_MAX_Y = PAGE_HEIGHT - MARGIN

export const CODE_SIZE = 9
export const CODE_LINE_GAP = 2

export const TITLE_SIZE = 13
export const TITLE_LINE_GAP = 4

/** `doc.moveDown(0.8)` after a filename title. */
export const GAP_AFTER_TITLE = 0.8
/** `doc.moveDown(1.5)` between two files. */
export const GAP_BETWEEN_FILES = 1.5

/** Font ids registered on the document. */
export const CODE_FONT = "code"
export const TITLE_FONT = "title"

/** Served from public/fonts/ — full JetBrains Mono, not subset (see ARCHITECTURE.md). */
export const CODE_FONT_URL = "/fonts/JetBrainsMono-Regular.ttf"
export const TITLE_FONT_URL = "/fonts/JetBrainsMono-Bold.ttf"

/** `generate.cjs` renders tabs as two spaces; hashing happens on raw bytes first. */
export const TAB_REPLACEMENT = "  "

/**
 * OpenType features for every text and measurement call. **Required, not
 * cosmetic.**
 *
 * JetBrains Mono ships programming ligatures through `calt` (contextual
 * alternates), and fontkit — the layout engine inside pdfkit — throws
 * `RangeError: Offset is outside the bounds of the DataView` when it resolves
 * any of them. Every common pair does it: `//`, `=>`, `!=`, `<=`, `===`, `->`.
 * Real source code hits one within a few lines, so leaving defaults on makes
 * the renderer crash on almost any input.
 *
 * Disabling is also the semantically right call: a proof-of-authorship listing
 * should show the literal characters an author typed, not `=>` fused into a
 * single arrow glyph.
 *
 * Note that passing an empty array does NOT work — fontkit still applies its
 * default feature set. Each feature must be switched off by name. The object
 * form is what fontkit accepts at runtime; `@types/pdfkit` types the field as
 * a string array, hence the cast.
 */
export const TEXT_FEATURES = {
  calt: false,
  liga: false,
  clig: false,
  dlig: false,
} as unknown as PDFKit.Mixins.OpenTypeFeatures[]
