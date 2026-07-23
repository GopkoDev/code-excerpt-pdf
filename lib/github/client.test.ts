import { afterEach, describe, expect, it, vi } from "vitest"

import { githubFetch, statusForError } from "@/lib/github/client"
import { GitHubError } from "@/lib/github/errors"

/** GitHub attaches the rate-limit headers to every response, including errors. */
const RATE_HEADERS = {
  "x-ratelimit-limit": "5000",
  "x-ratelimit-remaining": "4987",
  "x-ratelimit-reset": "1700000000",
}

const reply = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ message: "…" }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const stub = (response: Response) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

afterEach(() => vi.unstubAllGlobals())

async function failureOf(response: Response) {
  stub(response)
  try {
    await githubFetch("/repos/o/r/git/trees/HEAD?recursive=1", "token")
  } catch (error) {
    return error as GitHubError
  }
  throw new Error("Expected githubFetch to reject.")
}

/**
 * Reported from the running app: a private repository answered 429 "GitHub is
 * throttling rapid requests", while a public one opened fine.
 *
 * The whole path matters here, not just the classifier — what reached the
 * browser was the *status* from `statusForError`, and 429 tells a user to wait
 * for something that will never resolve on its own.
 */
describe("a private repository the app was never granted", () => {
  it("reaches the caller as a 403, not as throttling", async () => {
    const error = await failureOf(reply(403, RATE_HEADERS))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error.kind).toBe("forbidden")
    expect(statusForError(error)).toBe(403)
  })

  it("says what to do about it instead of telling the user to wait", async () => {
    const error = await failureOf(reply(403, RATE_HEADERS))

    expect(error.safeMessage).toMatch(/private/i)
    expect(error.safeMessage).not.toMatch(/throttl|wait|retry/i)
  })

  /**
   * A 403 has two causes that cannot be told apart without spending another
   * request: a missing `Contents` permission, or a repository that was never
   * added to the installation. Naming only the second sends the user to
   * re-tick a repository that is already ticked — which is what happens when
   * the App was registered without the permission at all.
   */
  it("names both causes, not just the repository selection", async () => {
    const error = await failureOf(reply(403, RATE_HEADERS))

    expect(error.safeMessage).toMatch(/contents/i)
    expect(error.safeMessage).toMatch(/granted|access/i)
  })
})

describe("real rate limiting still reads as rate limiting", () => {
  it("keeps a burst limit at 429 when GitHub asks us to back off", async () => {
    const error = await failureOf(
      reply(403, { ...RATE_HEADERS, "retry-after": "30" })
    )

    expect(error.kind).toBe("secondary-rate-limit")
    expect(statusForError(error)).toBe(429)
  })

  it("keeps an exhausted quota at 429", async () => {
    const error = await failureOf(
      reply(403, { ...RATE_HEADERS, "x-ratelimit-remaining": "0" })
    )

    expect(error.kind).toBe("rate-limited")
    expect(error.retryAt).toBe(1700000000)
    expect(statusForError(error)).toBe(429)
  })
})

describe("githubFetch", () => {
  it("sends the token and the pinned API version", async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(200))
    vi.stubGlobal("fetch", fetcher)

    await githubFetch("/user/installations", "ghu_secret")

    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe("https://api.github.com/user/installations")
    expect(init.headers.Authorization).toBe("Bearer ghu_secret")
    expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
    // Repository contents change out of band; a cached listing would export
    // the wrong revision.
    expect(init.cache).toBe("no-store")
  })

  it("maps an unreachable GitHub to 503, not to a generic failure", async () => {
    const error = await failureOf(reply(502))
    expect(statusForError(error)).toBe(503)
  })

  it("maps anything unrecognised to 500", () => {
    expect(statusForError(new Error("boom"))).toBe(500)
  })
})
