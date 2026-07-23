import { describe, expect, it } from "vitest"

import { resolveStatuses, type UsedFileRecord } from "@/lib/uniqueness/status"

const used = (
  path: string,
  contentHash: string,
  commitSha = "c1"
): UsedFileRecord => ({ path, contentHash, commitSha, sizeBytes: 100 })

const listed = (path: string, sizeBytes = 100) => ({
  path,
  name: path.split("/").pop()!,
  sizeBytes,
  status: "available" as const,
})

describe("resolveStatuses", () => {
  it("leaves a file that was never exported available", () => {
    const result = resolveStatuses([listed("src/a.ts")], [])
    expect(result[0].status).toBe("available")
  })

  it("marks a file used when the path and hash both match", () => {
    const result = resolveStatuses(
      [listed("src/a.ts")],
      [used("src/a.ts", "hash-1")],
      new Map([["src/a.ts", "hash-1"]])
    )
    expect(result[0].status).toBe("used")
  })

  /**
   * The distinction that makes re-export meaningful: the same path with new
   * content is genuinely new material, so it must not be locked out — but the
   * user still needs to know it overlaps something already filed.
   */
  it("marks a file used-but-changed when the hash moved on", () => {
    const result = resolveStatuses(
      [listed("src/a.ts")],
      [used("src/a.ts", "hash-old")],
      new Map([["src/a.ts", "hash-new"]])
    )
    expect(result[0].status).toBe("used-but-changed")
  })

  /**
   * Without content in hand there is no hash to compare. Assuming "unchanged"
   * is the safe reading: a used file must never *silently* re-enter a listing,
   * and the user can still select it deliberately.
   */
  it("assumes used when the current hash is unknown", () => {
    const result = resolveStatuses(
      [listed("src/a.ts")],
      [used("src/a.ts", "hash-old")]
    )
    expect(result[0].status).toBe("used")
  })

  it("matches on path, so a moved file is treated as new", () => {
    const result = resolveStatuses(
      [listed("src/moved.ts")],
      [used("src/a.ts", "hash-1")],
      new Map([["src/moved.ts", "hash-1"]])
    )
    expect(result[0].status).toBe("available")
  })

  it("leaves a file that is already vendored or unsupported alone", () => {
    const entries = [
      { ...listed("src/a.ts"), status: "vendored" as const },
      { ...listed("src/b.ts"), status: "unsupported" as const },
    ]
    const result = resolveStatuses(entries, [
      used("src/a.ts", "h"),
      used("src/b.ts", "h"),
    ])
    expect(result.map((entry) => entry.status)).toEqual([
      "vendored",
      "unsupported",
    ])
  })

  it("uses the most recent record when a path was exported twice", () => {
    const result = resolveStatuses(
      [listed("src/a.ts")],
      [used("src/a.ts", "hash-1", "c1"), used("src/a.ts", "hash-2", "c2")],
      new Map([["src/a.ts", "hash-2"]])
    )
    expect(result[0].status).toBe("used")
  })

  it("does not mutate the entries it was given", () => {
    const entries = [listed("src/a.ts")]
    resolveStatuses(entries, [used("src/a.ts", "h")])
    expect(entries[0].status).toBe("available")
  })

  it("handles an empty ledger and an empty listing", () => {
    expect(resolveStatuses([], [])).toEqual([])
    expect(resolveStatuses([listed("a.ts")], [])).toHaveLength(1)
  })
})
