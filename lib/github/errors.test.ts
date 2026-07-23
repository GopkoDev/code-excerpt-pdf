import { describe, expect, it } from "vitest"

import { GitHubError, describeResponse } from "@/lib/github/errors"

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers })

describe("describeResponse", () => {
  it("recognises an exhausted rate limit", () => {
    const error = describeResponse(
      response(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "99" })
    )
    expect(error?.kind).toBe("rate-limited")
    expect(error?.retryAt).toBe(99)
  })

  /**
   * A 403 with budget left is a *secondary* rate limit — a burst, not an
   * exhausted quota. Telling them apart matters: one is fixed by waiting for
   * the reset, the other by slowing down.
   */
  it("separates a secondary rate limit from an exhausted one", () => {
    const error = describeResponse(
      response(403, { "x-ratelimit-remaining": "4331", "retry-after": "60" })
    )
    expect(error?.kind).toBe("secondary-rate-limit")
  })

  it("maps 401 to an expired session rather than a generic failure", () => {
    expect(describeResponse(response(401))?.kind).toBe("unauthorized")
  })

  it("maps a plain 403 to forbidden", () => {
    expect(describeResponse(response(403))?.kind).toBe("forbidden")
  })

  /**
   * Reported from the running app: opening a private repository the App was
   * never granted showed "GitHub is throttling rapid requests" and a 429.
   *
   * GitHub answers that with 403 `Resource not accessible by integration`, and
   * — like every other GitHub response — it carries the rate-limit headers.
   * Treating their mere presence as evidence of throttling turns every
   * permissions error into a spurious retry-in-a-moment, which is advice that
   * can never work: no amount of waiting grants access to a repository.
   *
   * A response with budget left and no `retry-after` is not throttling.
   */
  it("does not mistake a permissions 403 for throttling", () => {
    const error = describeResponse(
      response(403, {
        "x-ratelimit-remaining": "4987",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000000",
      })
    )
    expect(error?.kind).toBe("forbidden")
  })

  it("still reads a secondary limit from retry-after alone", () => {
    // GitHub does not always zero the budget for a burst limit, so
    // `retry-after` is the signal that actually means "slow down".
    const error = describeResponse(
      response(403, { "x-ratelimit-remaining": "4987", "retry-after": "12" })
    )
    expect(error?.kind).toBe("secondary-rate-limit")
  })

  it("treats an explicit 429 as throttling even with budget left", () => {
    expect(
      describeResponse(response(429, { "x-ratelimit-remaining": "4987" }))?.kind
    ).toBe("secondary-rate-limit")
  })

  it("maps 404 to not-found — which for a private repo means no access", () => {
    expect(describeResponse(response(404))?.kind).toBe("not-found")
  })

  it("maps 5xx to unavailable", () => {
    expect(describeResponse(response(502))?.kind).toBe("unavailable")
  })

  it("returns null for a successful response", () => {
    expect(describeResponse(response(200))).toBeNull()
    expect(describeResponse(response(304))).toBeNull()
  })

  it("falls back to a typed unknown rather than throwing", () => {
    expect(describeResponse(response(418))?.kind).toBe("unknown")
  })
})

describe("GitHubError", () => {
  it("carries its kind and a message a user can read", () => {
    const error = new GitHubError("not-found", "Repository not found.")
    expect(error).toBeInstanceOf(Error)
    expect(error.kind).toBe("not-found")
    expect(error.message).toMatch(/not found/i)
  })

  it("never carries a token, even if one is passed in the message", () => {
    const error = new GitHubError("unauthorized", "bad token ghu_SECRET123")
    expect(error.safeMessage).not.toMatch(/ghu_/)
  })
})
