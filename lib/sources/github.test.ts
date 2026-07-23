import { describe, expect, it, vi } from "vitest"

import { createGitHubSource } from "@/lib/sources/github"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const treePayload = {
  headSha: "head1",
  truncated: false,
  files: [
    { path: "src/a.ts", sizeBytes: 120, blobSha: "sha-a" },
    { path: "README.md", sizeBytes: 40, blobSha: "sha-r" },
  ],
}

describe("createGitHubSource", () => {
  it("lists files from a single tree call", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(treePayload))
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )

    const files = await source.listFiles()
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "README.md"])
    expect(files[0]).toMatchObject({
      name: "a.ts",
      sizeBytes: 120,
      status: "available",
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  /**
   * SPEC: opening a repo issues exactly one Trees call, and navigating away and
   * back within the session issues zero further calls.
   */
  it("does not call the tree endpoint twice", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(treePayload))
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )

    await source.listFiles()
    await source.listFiles()
    await source.listFiles()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("fetches content only for the file asked for, by blob sha", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes("/tree")) return json(treePayload)
      return json({
        sizeBytes: 3,
        base64: Buffer.from("abc").toString("base64"),
      })
    })
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )

    await source.listFiles()
    const bytes = await source.readFile("src/a.ts")

    expect(new TextDecoder().decode(bytes)).toBe("abc")
    const blobCall = fetcher.mock.calls.find(([u]) =>
      String(u).includes("/blob")
    )
    expect(String(blobCall?.[0])).toContain("sha=sha-a")
  })

  it("caches content so a second read costs no request", async () => {
    const fetcher = vi.fn(async (input: string | URL) =>
      String(input).includes("/tree")
        ? json(treePayload)
        : json({ sizeBytes: 3, base64: Buffer.from("abc").toString("base64") })
    )
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )

    await source.listFiles()
    await source.readFile("src/a.ts")
    await source.readFile("src/a.ts")

    const blobCalls = fetcher.mock.calls.filter(([u]) =>
      String(u).includes("/blob")
    )
    expect(blobCalls).toHaveLength(1)
  })

  it("surfaces truncation rather than hiding it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ ...treePayload, truncated: true }))
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )

    await source.listFiles()
    expect(source.isTruncated()).toBe(true)
  })

  it("throws with the server's message when the tree call fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ error: "Not found." }, 404))
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )
    await expect(source.listFiles()).rejects.toThrow(/not found/i)
  })

  it("refuses to read a path the tree never listed", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(treePayload))
    const source = createGitHubSource(
      { owner: "o", repo: "r" },
      { fetcher: fetcher as unknown as typeof fetch }
    )
    await source.listFiles()
    await expect(source.readFile("nope.ts")).rejects.toThrow(/nope\.ts/)
  })
})
