import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchInstallationState, installUrl } from "@/lib/github/installation"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

afterEach(() => vi.unstubAllGlobals())

describe("installUrl", () => {
  it("points at the app's own install page", () => {
    expect(installUrl("code-excerpt-pdf")).toBe(
      "https://github.com/apps/code-excerpt-pdf/installations/new"
    )
  })

  it("falls back to the installations index rather than a broken URL", () => {
    expect(installUrl(undefined)).toBe(
      "https://github.com/settings/installations"
    )
  })
})

describe("fetchInstallationState", () => {
  it("reports no installation without treating it as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ total_count: 0, installations: [] }))
    )

    await expect(fetchInstallationState("token")).resolves.toEqual({
      hasInstallation: false,
      installationCount: 0,
      installationIds: [],
    })
  })

  /** The repository list is per installation, so the ids have to come back. */
  it("returns the installation ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ total_count: 2, installations: [{ id: 5 }, { id: 6 }] })
        )
    )

    await expect(fetchInstallationState("token")).resolves.toEqual({
      hasInstallation: true,
      installationCount: 2,
      installationIds: [5, 6],
    })
  })

  /**
   * It must fail the way every other GitHub call fails, or the route handler's
   * status mapping would not apply to it.
   */
  it("raises a mapped GitHubError, not a bare status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ message: "Bad credentials" }, 401))
    )

    await expect(fetchInstallationState("token")).rejects.toMatchObject({
      name: "GitHubError",
      kind: "unauthorized",
    })
  })
})
