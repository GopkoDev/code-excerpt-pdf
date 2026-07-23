import { describe, expect, it } from "vitest"

import { parseExportRequest } from "@/lib/exports/payload"

const SHA = "a".repeat(40)
const HASH = "b".repeat(64)

const body = (overrides: Record<string, unknown> = {}) => ({
  repo: { owner: "octo", name: "hello" },
  actualPages: 3,
  files: [
    { path: "src/a.ts", commitSha: SHA, contentHash: HASH, sizeBytes: 120 },
  ],
  ...overrides,
})

describe("parseExportRequest", () => {
  it("accepts a well-formed export", () => {
    const result = parseExportRequest(body())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.repo).toEqual({ owner: "octo", name: "hello" })
    expect(result.value.files).toHaveLength(1)
  })

  /**
   * The NDA constraint, enforced at the boundary rather than trusted: this
   * payload is the only thing a browser can push into the database, so a field
   * that could carry source code must not survive parsing even if a client
   * sends one.
   */
  it("drops any field the ledger did not ask for", () => {
    const result = parseExportRequest(
      body({
        files: [
          {
            path: "src/a.ts",
            commitSha: SHA,
            contentHash: HASH,
            sizeBytes: 120,
            content: "export const secret = 1",
            text: "…",
          },
        ],
        secret: "…",
      })
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.value.files[0]).sort()).toEqual([
      "commitSha",
      "contentHash",
      "path",
      "sizeBytes",
    ])
    expect(Object.keys(result.value).sort()).toEqual([
      "actualPages",
      "files",
      "repo",
    ])
  })

  /**
   * Owner and name are interpolated into a GitHub API path when the export is
   * later re-downloaded, so the same shapes the tree route refuses are refused
   * here — a ledger row is a stored instruction to fetch something.
   */
  it("refuses an owner or name that could leave the repository path", () => {
    expect(parseExportRequest(body({ repo: { owner: "a/b", name: "x" } })).ok)
      .toBe(false)
    expect(parseExportRequest(body({ repo: { owner: "a", name: ".." } })).ok)
      .toBe(false)
    expect(
      parseExportRequest(body({ repo: { owner: "-bad", name: "x" } })).ok
    ).toBe(false)
  })

  it("refuses a commit SHA or content hash that is not hex", () => {
    expect(
      parseExportRequest(
        body({
          files: [
            {
              path: "a.ts",
              commitSha: "HEAD",
              contentHash: HASH,
              sizeBytes: 1,
            },
          ],
        })
      ).ok
    ).toBe(false)
    expect(
      parseExportRequest(
        body({
          files: [
            { path: "a.ts", commitSha: SHA, contentHash: "nope", sizeBytes: 1 },
          ],
        })
      ).ok
    ).toBe(false)
  })

  it("refuses a path that is absolute or climbs out of the repository", () => {
    for (const path of ["/etc/passwd", "../secrets.ts", "a/../../b.ts", ""]) {
      const result = parseExportRequest(
        body({
          files: [
            { path, commitSha: SHA, contentHash: HASH, sizeBytes: 1 },
          ],
        })
      )
      expect(result.ok, path).toBe(false)
    }
  })

  /**
   * An export of nothing produced no PDF — recording it would put a row in the
   * history that can never be re-downloaded.
   */
  it("refuses an export with no files", () => {
    expect(parseExportRequest(body({ files: [] })).ok).toBe(false)
  })

  it("refuses page and size counts that cannot have come from a render", () => {
    expect(parseExportRequest(body({ actualPages: 0 })).ok).toBe(false)
    expect(parseExportRequest(body({ actualPages: 1.5 })).ok).toBe(false)
    expect(
      parseExportRequest(
        body({
          files: [
            { path: "a.ts", commitSha: SHA, contentHash: HASH, sizeBytes: -1 },
          ],
        })
      ).ok
    ).toBe(false)
  })

  it("refuses a payload that is not an object at all", () => {
    expect(parseExportRequest(null).ok).toBe(false)
    expect(parseExportRequest("hello").ok).toBe(false)
    expect(parseExportRequest([]).ok).toBe(false)
  })

  it("keeps the optional default branch when one is supplied", () => {
    const result = parseExportRequest(
      body({ repo: { owner: "octo", name: "hello", defaultBranch: "main" } })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.repo.defaultBranch).toBe("main")
  })
})
