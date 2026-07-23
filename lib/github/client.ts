/**
 * The one place an HTTP request goes to GitHub.
 *
 * SPEC draws a hard boundary: GitHub is called only from `app/api/github/*`,
 * never from a Server Component. This module is the shared plumbing those
 * route handlers use — auth header, API version pin, and error mapping — so
 * that no handler hand-rolls a fetch and quietly skips the error translation.
 */

import { describeResponse, GitHubError } from "./errors"

const GITHUB_API = "https://api.github.com"

const MESSAGES: Record<string, string> = {
  unauthorized: "Your GitHub session expired. Sign in again.",
  /**
   * Two different causes produce this, and they are indistinguishable here
   * without spending another request: the App may lack the `Contents` read
   * permission, or it may simply not have been granted this repository. Both
   * are named, because advising only the second sends a user to re-tick a
   * repository that is already ticked.
   *
   * Public repositories are readable by any authenticated token, so this is
   * almost always a private repository — which is why it is worth saying that
   * a public one working proves nothing about the permission.
   */
  forbidden:
    "GitHub refused access to this repository. A private one needs the app to hold the Contents (read-only) permission and to have been granted this repository — check both in Settings.",
  "not-found":
    "Not found. For a private repository this usually means the app was never granted access to it.",
  "rate-limited": "GitHub's hourly API limit is used up. Try again later.",
  "secondary-rate-limit":
    "GitHub is throttling rapid requests. Wait a moment and retry.",
  unavailable: "GitHub is having trouble right now. Try again shortly.",
  unknown: "GitHub returned an unexpected response.",
}

export async function githubFetch(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    // Repository contents change out of band; a stale cache would silently
    // export the wrong revision.
    cache: "no-store",
  })

  const problem = describeResponse(response)
  if (problem) {
    throw new GitHubError(
      problem.kind,
      MESSAGES[problem.kind] ?? MESSAGES.unknown,
      problem.retryAt
    )
  }

  return response.json()
}

export function statusForError(error: unknown): number {
  if (!(error instanceof GitHubError)) return 500
  switch (error.kind) {
    case "unauthorized":
      return 401
    case "forbidden":
      return 403
    case "not-found":
      return 404
    case "rate-limited":
    case "secondary-rate-limit":
      return 429
    case "unavailable":
      return 503
    default:
      return 500
  }
}
