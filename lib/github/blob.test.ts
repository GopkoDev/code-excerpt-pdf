import { describe, expect, it } from "vitest"

import { decodeBlobResponse } from "@/lib/github/blob"

const toBase64 = (text: string) =>
  Buffer.from(new TextEncoder().encode(text)).toString("base64")

describe("decodeBlobResponse", () => {
  it("decodes base64 content to raw bytes", () => {
    const bytes = decodeBlobResponse({
      content: toBase64("const a = 1\n"),
      encoding: "base64",
      size: 12,
      sha: "abc",
    })
    expect(new TextDecoder().decode(bytes)).toBe("const a = 1\n")
  })

  /** GitHub wraps base64 at 60 columns; the newlines are not content. */
  it("tolerates the line breaks GitHub inserts", () => {
    const wrapped = toBase64("x".repeat(200)).replace(/(.{60})/g, "$1\n")
    const bytes = decodeBlobResponse({
      content: wrapped,
      encoding: "base64",
      size: 200,
      sha: "abc",
    })
    expect(bytes.length).toBe(200)
  })

  it("round-trips non-ASCII bytes exactly", () => {
    const text = "// Привіт, світ\n"
    const bytes = decodeBlobResponse({
      content: toBase64(text),
      encoding: "base64",
      size: 0,
      sha: "abc",
    })
    // Byte-exact matters: the content hash is taken over these bytes.
    expect(new TextDecoder().decode(bytes)).toBe(text)
  })

  it("handles an empty file", () => {
    const bytes = decodeBlobResponse({
      content: "",
      encoding: "base64",
      size: 0,
      sha: "abc",
    })
    expect(bytes.length).toBe(0)
  })

  /**
   * Blobs over 1 MB come back with encoding "none" and no content — the
   * Contents API refuses them. Failing loudly beats returning an empty file
   * that would silently export as a blank page.
   */
  it("refuses a blob GitHub declined to inline", () => {
    expect(() =>
      decodeBlobResponse({
        content: "",
        encoding: "none",
        size: 5_000_000,
        sha: "abc",
      })
    ).toThrow(/too large|encoding/i)
  })

  it("rejects a payload that is not shaped like a blob", () => {
    expect(() => decodeBlobResponse({ nope: true })).toThrow()
    expect(() => decodeBlobResponse(null)).toThrow()
  })
})
