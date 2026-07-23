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
  forbidden:
    "GitHub refused access to this repository. If it is private, the app has not been granted access to it — add it from Settings.",
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
