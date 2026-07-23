import { describe, expect, it } from "vitest"

import { parseTreeResponse } from "@/lib/github/tree"

const blob = (path: string, size = 100) => ({
  path,
  mode: "100644",
  type: "blob",
  sha: "abc",
  size,
  url: "https://api.github.com/...",
})

describe("parseTreeResponse", () => {
  it("keeps blobs and drops trees — folders come from the paths", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: false,
      tree: [
        blob("src/a.ts"),
        { path: "src", mode: "040000", type: "tree", sha: "d1" },
      ],
    })
    expect(parsed.files.map((f) => f.path)).toEqual(["src/a.ts"])
  })

  it("carries size and blob sha through", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: false,
      tree: [blob("a.ts", 4096)],
    })
    expect(parsed.files[0]).toMatchObject({
      path: "a.ts",
      sizeBytes: 4096,
      blobSha: "abc",
    })
  })

  /**
   * A monorepo can exceed the Trees API's limit, and GitHub says so with a
   * flag rather than an error. Silently dropping the tail would quietly hide
   * files from a listing — SPEC requires surfacing it honestly.
   */
  it("reports truncation instead of hiding it", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: true,
      tree: [blob("a.ts")],
    })
    expect(parsed.truncated).toBe(true)
  })

  it("skips submodules and symlinks, which have no fetchable content", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: false,
      tree: [
        blob("a.ts"),
        { path: "vendor/lib", mode: "160000", type: "commit", sha: "s1" },
        { path: "link.ts", mode: "120000", type: "blob", sha: "s2", size: 10 },
      ],
    })
    expect(parsed.files.map((f) => f.path)).toEqual(["a.ts"])
  })

  it("defaults a missing size to zero rather than dropping the file", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: false,
      tree: [{ path: "a.ts", mode: "100644", type: "blob", sha: "abc" }],
    })
    expect(parsed.files[0].sizeBytes).toBe(0)
  })

  it("rejects a response that is not shaped like a tree", () => {
    expect(() => parseTreeResponse({ nope: true })).toThrow()
    expect(() => parseTreeResponse(null)).toThrow()
    expect(() => parseTreeResponse("<html>rate limited</html>")).toThrow()
  })

  it("returns the head sha, which keys the cache", () => {
    expect(
      parseTreeResponse({ sha: "deadbeef", truncated: false, tree: [] }).headSha
    ).toBe("deadbeef")
  })

  it("handles an empty repository", () => {
    const parsed = parseTreeResponse({
      sha: "head",
      truncated: false,
      tree: [],
    })
    expect(parsed.files).toEqual([])
  })
})
