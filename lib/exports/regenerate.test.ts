import { describe, expect, it, vi } from "vitest"

import { collectPinnedFiles, type PinnedFile } from "@/lib/exports/regenerate"
import { sha256Hex } from "@/lib/uniqueness/hash"

const SHA = "a".repeat(40)
const OTHER_SHA = "b".repeat(40)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const blobResponse = (text: string) =>
  json({
    sizeBytes: text.length,
    base64: Buffer.from(text, "utf8").toString("base64"),
  })

const tree = (files: { path: string; blobSha: string }[]) =>
  json({
    headSha: SHA,
    truncated: false,
    files: files.map((file) => ({ ...file, sizeBytes: 10 })),
  })

/** Routes the two endpoints a regeneration touches, by URL. */
function fakeGitHub(
  trees: Record<string, Response | (() => Response)>,
  blobs: Record<string, string>
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://example.test")
    if (url.pathname === "/api/github/tree") {
      const answer = trees[url.searchParams.get("ref") ?? ""]
      if (!answer) return json({ error: "not-found" }, 404)
      return typeof answer === "function" ? answer() : answer.clone()
    }
    if (url.pathname === "/api/github/blob") {
      const content = blobs[url.searchParams.get("sha") ?? ""]
      if (content === undefined) return json({ error: "gone" }, 404)
      return blobResponse(content)
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }) as unknown as typeof fetch
}

const pinned = async (
  path: string,
  text: string,
  commitSha = SHA
): Promise<PinnedFile> => ({
  path,
  commitSha,
  contentHash: await sha256Hex(new TextEncoder().encode(text)),
})

const repo = { owner: "octo", name: "hello" }

describe("collectPinnedFiles", () => {
  /**
   * Re-downloading a past export must not re-list the repository at HEAD: the
   * point of pinning is that the bytes are the ones that were filed. One tree
   * call per distinct pinned SHA, and one blob call per file.
   */
  it("re-fetches at the pinned SHA, one tree call per distinct SHA", async () => {
    const fetcher = fakeGitHub(
      {
        [SHA]: tree([
          { path: "a.ts", blobSha: "blob-a" },
          { path: "b.ts", blobSha: "blob-b" },
        ]),
      },
      { "blob-a": "alpha", "blob-b": "beta" }
    )

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha"), await pinned("b.ts", "beta")],
      { fetcher }
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"])
    expect(new TextDecoder().decode(result.files[0].bytes)).toBe("alpha")
    expect(result.changed).toEqual([])
    expect(result.missing).toEqual([])

    const calls = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls
    const treeCalls = calls.filter((call) =>
      String(call[0]).includes("/api/github/tree")
    )
    expect(treeCalls).toHaveLength(1)
  })

  it("fetches each pinned SHA once when an export spans two revisions", async () => {
    const fetcher = fakeGitHub(
      {
        [SHA]: tree([{ path: "a.ts", blobSha: "blob-a" }]),
        [OTHER_SHA]: tree([{ path: "b.ts", blobSha: "blob-b" }]),
      },
      { "blob-a": "alpha", "blob-b": "beta" }
    )

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha"), await pinned("b.ts", "beta", OTHER_SHA)],
      { fetcher }
    )

    expect(result.kind).toBe("ok")
    const calls = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(
      calls.filter((call) => String(call[0]).includes("/api/github/tree"))
    ).toHaveLength(2)
  })

  /**
   * SPEC: if a repo or a commit is gone, say so and point at the emailed copy
   * — never fail obscurely. A 404 on the pinned tree is exactly that case.
   */
  it("reports source-gone when the pinned revision no longer resolves", async () => {
    const fetcher = fakeGitHub({}, {})

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha")],
      { fetcher }
    )

    expect(result.kind).toBe("source-gone")
  })

  it("keeps a rate limit distinguishable from a deleted repository", async () => {
    const fetcher = vi.fn(async () =>
      json({ error: "GitHub's hourly API limit is used up." }, 429)
    ) as unknown as typeof fetch

    await expect(
      collectPinnedFiles(repo, [await pinned("a.ts", "alpha")], { fetcher })
    ).rejects.toThrow(/hourly API limit/)
  })

  it("carries on when one file has since been deleted", async () => {
    const fetcher = fakeGitHub(
      { [SHA]: tree([{ path: "a.ts", blobSha: "blob-a" }]) },
      { "blob-a": "alpha" }
    )

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha"), await pinned("gone.ts", "x")],
      { fetcher }
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.files.map((file) => file.path)).toEqual(["a.ts"])
    expect(result.missing.map((file) => file.path)).toEqual(["gone.ts"])
  })

  it("records a hash mismatch instead of refusing to rebuild", async () => {
    const fetcher = fakeGitHub(
      { [SHA]: tree([{ path: "a.ts", blobSha: "blob-a" }]) },
      { "blob-a": "not what was filed" }
    )

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha")],
      { fetcher }
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    // Informational, never a gate — the file is still rebuilt.
    expect(result.changed).toEqual(["a.ts"])
    expect(result.files).toHaveLength(1)
  })

  it("treats a blob that will not load as missing, not as a failure", async () => {
    const fetcher = fakeGitHub(
      {
        [SHA]: tree([
          { path: "a.ts", blobSha: "blob-a" },
          { path: "b.ts", blobSha: "blob-missing" },
        ]),
      },
      { "blob-a": "alpha" }
    )

    const result = await collectPinnedFiles(
      repo,
      [await pinned("a.ts", "alpha"), await pinned("b.ts", "beta")],
      { fetcher }
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.files.map((file) => file.path)).toEqual(["a.ts"])
    expect(result.missing.map((file) => file.path)).toEqual(["b.ts"])
  })
})
