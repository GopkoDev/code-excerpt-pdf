import { describe, expect, it } from "vitest"

import { TAB_REPLACEMENT } from "@/lib/pdf/constants"
import { normalizeCode } from "@/lib/pdf/measure"
import { sha256Hex } from "@/lib/uniqueness/hash"

const encode = (text: string) => new TextEncoder().encode(text)

describe("sha256Hex", () => {
  it("produces the known SHA-256 of an empty input", () => {
    return expect(sha256Hex(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )
  })

  it("produces the known SHA-256 of 'abc'", async () => {
    await expect(sha256Hex(encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })

  it("is 64 lowercase hex characters", async () => {
    expect(await sha256Hex(encode("anything"))).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is stable across calls", async () => {
    const bytes = encode("const a = 1\n")
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes))
  })

  it("differs for content differing by one byte", async () => {
    expect(await sha256Hex(encode("a"))).not.toBe(await sha256Hex(encode("b")))
  })

  /**
   * The rule this test exists to lock down: hashing happens on RAW bytes,
   * before the tab transform. Hashing post-transform would mean any future
   * whitespace tweak invalidates every stored hash and resurrects files the
   * user has already exported.
   */
  it("distinguishes a tab from the spaces it renders as", async () => {
    const withTab = "\tconst a = 1\n"
    const withSpaces = `${TAB_REPLACEMENT}const a = 1\n`

    expect(normalizeCode(withTab)).toBe(withSpaces)
    expect(await sha256Hex(encode(withTab))).not.toBe(
      await sha256Hex(encode(withSpaces))
    )
  })

  it("distinguishes CRLF from LF, which normalization also collapses", async () => {
    expect(normalizeCode("a\r\nb")).toBe(normalizeCode("a\nb"))
    expect(await sha256Hex(encode("a\r\nb"))).not.toBe(
      await sha256Hex(encode("a\nb"))
    )
  })
})
