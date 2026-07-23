/**
 * Turning uploaded bytes into renderable text, or an honest refusal.
 *
 * A binary file must never reach the renderer: pdfkit would either draw
 * .notdef boxes or, worse, measure something plausible and silently corrupt
 * the page count. SPEC requires binaries be rejected with a *visible reason*,
 * so the failure carries a sentence a user can act on.
 */

export type DecodeResult =
  { ok: true; text: string } | { ok: false; reason: string }

const BOM = "﻿"

export function decodeSourceFile(bytes: Uint8Array): DecodeResult {
  // A NUL byte is the classic binary tell — it cannot occur in text, and
  // TextDecoder would happily turn it into U+0000 rather than throw.
  if (bytes.includes(0)) {
    return {
      ok: false,
      reason:
        "Looks like a binary file (contains a NUL byte), not source code.",
    }
  }

  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return {
      ok: false,
      reason: "Not valid UTF-8 text — this looks like a binary file.",
    }
  }

  // A leading BOM is invisible in an editor but renders as a stray glyph and
  // shifts the first line's width.
  return { ok: true, text: text.startsWith(BOM) ? text.slice(1) : text }
}
