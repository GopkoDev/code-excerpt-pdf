import { describe, expect, it } from "vitest"

import { decodeSourceFile } from "@/lib/files/decode"

const encode = (text: string) => new TextEncoder().encode(text)

describe("decodeSourceFile", () => {
  it("decodes UTF-8 text", () => {
    const result = decodeSourceFile(encode("const a = 1\n"))
    expect(result).toEqual({ ok: true, text: "const a = 1\n" })
  })

  it("decodes non-ASCII text", () => {
    const result = decodeSourceFile(encode("// Привіт, світ\n"))
    expect(result.ok && result.text).toBe("// Привіт, світ\n")
  })

  it("accepts an empty file", () => {
    expect(decodeSourceFile(new Uint8Array())).toEqual({ ok: true, text: "" })
  })

  it("strips a UTF-8 BOM so it never renders as a stray glyph", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...encode("const a = 1")])
    expect(decodeSourceFile(withBom)).toEqual({ ok: true, text: "const a = 1" })
  })

  it("rejects content containing a NUL byte", () => {
    const result = decodeSourceFile(new Uint8Array([0x61, 0x00, 0x62]))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/binary/i)
  })

  it("rejects a PNG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(decodeSourceFile(png).ok).toBe(false)
  })

  it("rejects invalid UTF-8", () => {
    // 0xff never appears in well-formed UTF-8.
    const result = decodeSourceFile(new Uint8Array([0x61, 0xff, 0x62]))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/utf-8/i)
  })

  it("gives a reason a user can act on, not a stack trace", () => {
    const result = decodeSourceFile(new Uint8Array([0x00]))
    expect(result.ok === false && result.reason.length).toBeGreaterThan(10)
  })
})
