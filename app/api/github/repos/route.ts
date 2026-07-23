import { NextResponse } from "next/server"

import { githubFetch, statusForError } from "@/lib/github/client"
import { mapWithConcurrency } from "@/lib/github/concurrency"
import { GitHubError } from "@/lib/github/errors"
import { fetchInstallationState } from "@/lib/github/installation"
import { parseRepositoriesResponse, type RepoSummary } from "@/lib/github/repos"
import { readAccessToken } from "@/lib/github/session-token"

/**
 * The repositories this user's installations can reach.
 *
 * A route handler rather than a Server Component, per SPEC: every GitHub call
 * lives under `app/api/github/*` so the token stays in the encrypted cookie
 * and never travels through an RSC payload.
 *
 * Two calls deep, unavoidably. `/user/installations` answers *where* the App
 * is installed; the repository list is per installation. A user with one
 * installation — the ordinary case — costs two requests against a 5000/hr
 * budget.
 */

/** GitHub's maximum; asking for less would only add pages. */
const PER_PAGE = 100

export async function GET(request: Request) {
  const session = await readAccessToken(request)
  if (!session) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }
  if (session.expired) {
    // The caller refreshes through /api/github/refresh, the only route allowed
    // to rotate the token, and retries.
    return NextResponse.json({ error: "token-expired" }, { status: 401 })
  }

  try {
    const installations = await fetchInstallationState(session.token)

    // Zero installations is a normal state, not a failure: the user signed in
    // fine and simply granted access to nothing yet. The page routes them to
    // the install URL on the strength of this count.
    if (!installations.hasInstallation) {
      return NextResponse.json({ totalCount: 0, repositories: [] })
    }

    const perInstallation = await mapWithConcurrency(
      installations.installationIds,
      async (id) =>
        parseRepositoriesResponse(
          await githubFetch(
            `/user/installations/${id}/repositories?per_page=${PER_PAGE}`,
            session.token
          )
        ),
      3
    )

    // The same repository can be reachable through more than one installation
    // (a user account and an org that forked it), and the list is a menu — a
    // duplicate row would just be a second link to the same page.
    const byId = new Map<number, RepoSummary>()
    perInstallation
      .flat()
      .forEach((repository) => byId.set(repository.id, repository))

    const repositories = [...byId.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    )

    return NextResponse.json({
      totalCount: installations.installationCount,
      repositories,
    })
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.safeMessage
        : "Could not list your repositories."
    return NextResponse.json(
      { error: message },
      { status: statusForError(error) }
    )
  }
}
