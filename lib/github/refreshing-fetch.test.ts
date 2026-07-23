import { describe, expect, it, vi } from "vitest"

import { createRefreshingFetch } from "@/lib/github/refreshing-fetch"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

describe("createRefreshingFetch", () => {
  it("passes a healthy response straight through", async () => {
    const underlying = vi.fn().mockResolvedValue(json({ ok: true }))
    const fetcher = createRefreshingFetch(underlying as unknown as typeof fetch)

    const response = await fetcher("/api/github/tree?owner=o&repo=r")

    expect(response.status).toBe(200)
    expect(underlying).toHaveBeenCalledTimes(1)
  })

  /**
   * The eight-hour token expiring mid-session must not look like a failure.
   * Only /api/github/refresh may rotate it, so the retry has to go through
   * there — never by refreshing inline.
   */
  it("refreshes once and retries when the token expired", async () => {
    const underlying = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "token-expired" }, 401))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ tree: [] }))
    const fetcher = createRefreshingFetch(underlying as unknown as typeof fetch)

    const response = await fetcher("/api/github/tree?owner=o&repo=r")

    expect(response.status).toBe(200)
    expect(String(underlying.mock.calls[1][0])).toBe("/api/github/refresh")
    expect(underlying.mock.calls[1][1]).toMatchObject({ method: "POST" })
    expect(underlying).toHaveBeenCalledTimes(3)
  })

  it("does not retry a request that was never signed in", async () => {
    const underlying = vi
      .fn()
      .mockResolvedValue(json({ error: "not-signed-in" }, 401))
    const fetcher = createRefreshingFetch(underlying as unknown as typeof fetch)

    const response = await fetcher("/api/github/tree?owner=o&repo=r")

    expect(response.status).toBe(401)
    expect(underlying).toHaveBeenCalledTimes(1)
  })

  it("gives up rather than looping when the refresh itself fails", async () => {
    const underlying = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "token-expired" }, 401))
      .mockResolvedValueOnce(json({ error: "refresh-failed" }, 401))
    const fetcher = createRefreshingFetch(underlying as unknown as typeof fetch)

    const response = await fetcher("/api/github/tree?owner=o&repo=r")

    expect(response.status).toBe(401)
    expect(underlying).toHaveBeenCalledTimes(2)
  })

  /**
   * Selecting a folder fires several blob reads at once. GitHub's refresh
   * tokens are single-use, so five parallel refreshes would spend four tokens
   * that were already retired — the random-logout bug, from the client side.
   */
  it("coalesces parallel expiries into a single refresh", async () => {
    const underlying = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url === "/api/github/refresh") return json({ ok: true })
      return calls++ < 3 ? json({ error: "token-expired" }, 401) : json({})
    })
    let calls = 0
    const fetcher = createRefreshingFetch(underlying as unknown as typeof fetch)

    await Promise.all([
      fetcher("/api/github/blob?sha=1"),
      fetcher("/api/github/blob?sha=2"),
      fetcher("/api/github/blob?sha=3"),
    ])

    const refreshes = underlying.mock.calls.filter(
      ([url]) => String(url) === "/api/github/refresh"
    )
    expect(refreshes).toHaveLength(1)
  })
})
