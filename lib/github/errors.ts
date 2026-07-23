/**
 * Turning GitHub's responses into something the UI can act on.
 *
 * The distinctions here are the ones that change what a user should *do*, not
 * merely what happened. A 404 on a private repo means "no access", not "gone".
 * A 403 with budget remaining is a burst limit, fixed by slowing down; a 403
 * with zero remaining is an exhausted quota, fixed only by waiting.
 */

export type GitHubErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "secondary-rate-limit"
  | "unavailable"
  | "unknown"

export type ResponseProblem = {
  kind: GitHubErrorKind
  /** Epoch seconds when the primary quota resets. */
  retryAt?: number
  /** Seconds to wait, for a secondary limit. */
  retryAfterSeconds?: number
}

/** Anything token-shaped, so it can never reach a log or an error surface. */
const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)/g

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind
  readonly retryAt?: number

  constructor(kind: GitHubErrorKind, message: string, retryAt?: number) {
    super(message)
    this.name = "GitHubError"
    this.kind = kind
    this.retryAt = retryAt
  }

  /**
   * SPEC forbids logging or storing a decrypted token. Error messages are the
   * likeliest accidental route — GitHub sometimes echoes credentials back —
   * so anything token-shaped is redacted before the message is surfaced.
   */
  get safeMessage(): string {
    return this.message.replace(TOKEN_PATTERN, "[redacted]")
  }
}

export function describeResponse(response: Response): ResponseProblem | null {
  if (response.ok || response.status === 304) return null

  const remaining = response.headers.get("x-ratelimit-remaining")
  const retryAfter = response.headers.get("retry-after")

  switch (response.status) {
    case 401:
      return { kind: "unauthorized" }

    case 403:
    case 429: {
      if (remaining === "0") {
        const reset = response.headers.get("x-ratelimit-reset")
        return {
          kind: "rate-limited",
          retryAt: reset ? Number(reset) : undefined,
        }
      }
      /**
       * Budget left but still refused. Only two things say that is a *burst*
       * limit: an explicit 429, or a `retry-after` telling us how long to hold
       * off. Anything else is a permissions refusal wearing a 403 — most often
       * `Resource not accessible by integration`, which is what a private
       * repository the App was never granted returns.
       *
       * The rate-limit headers are NOT evidence either way: GitHub attaches
       * them to every response, so reading their presence as throttling
       * classified every permissions error as "wait a moment and retry" —
       * advice that can never come true.
       */
      if (retryAfter || response.status === 429) {
        return {
          kind: "secondary-rate-limit",
          retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined,
        }
      }
      return { kind: "forbidden" }
    }

    case 404:
      // For a private repo this also means "the App was never granted access",
      // which is the far likelier cause than the repo being deleted.
      return { kind: "not-found" }

    default:
      return response.status >= 500
        ? { kind: "unavailable" }
        : { kind: "unknown" }
  }
}
