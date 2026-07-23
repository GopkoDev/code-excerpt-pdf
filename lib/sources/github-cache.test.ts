import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearGitHubSources, getGitHubSource } from "@/lib/sources/github-cache"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const treePayload = {
  headSha: "head1",
  truncated: false,
  files: [{ path: "src/a.ts", sizeBytes: 120, blobSha: "sha-a" }],
}

describe("getGitHubSource", () => {
  beforeEach(() => clearGitHubSources())

  /**
   * SPEC: navigating away from a repo and back within the session issues zero
   * further GitHub calls. `createGitHubSource` caches per instance, so the
   * instance has to outlive the page component — mounting the page again must
   * not build a second source.
   */
  it("hands back the same source for the same repo", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(treePayload))
    const options = { fetcher: fetcher as unknown as typeof fetch }

    const first = getGitHubSource({ owner: "o", repo: "r" }, options)
    await first.listFiles()
    const second = getGitHubSource({ owner: "o", repo: "r" }, options)
    await second.listFiles()

    expect(second).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("keeps different repos and refs apart", () => {
    const options = { fetcher: vi.fn() as unknown as typeof fetch }
    const a = getGitHubSource({ owner: "o", repo: "r" }, options)
    const b = getGitHubSource({ owner: "o", repo: "other" }, options)
    const c = getGitHubSource({ owner: "o", repo: "r", ref: "dev" }, options)

    expect(b).not.toBe(a)
    expect(c).not.toBe(a)
  })
})
