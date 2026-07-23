import { NextResponse } from "next/server"

import { upsertUser } from "@/lib/db/exports"
import { readCachedTree, writeCachedTree } from "@/lib/db/tree-cache"
import { treeCacheDb } from "@/lib/db/tree-cache-db"
import { githubFetch, statusForError } from "@/lib/github/client"
import { GitHubError } from "@/lib/github/errors"
import { isValidOwner, isValidRepoName } from "@/lib/github/repo-id"
import { readAccessToken } from "@/lib/github/session-token"
import { parseTreeResponse } from "@/lib/github/tree"

/**
 * One `recursive=1` Trees call per repository — or none, on a cache hit.
 *
 * SPEC's API budget rests on this being the only tree read: the whole file
 * list, including sizes, arrives in a single request, and the tree view then
 * runs on those sizes without fetching any content.
 *
 * Two tiers sit in front of it. `lib/sources/github.ts` holds the answer for
 * as long as the tab lives; `TreeCache` holds it across cold starts, so a new
 * tab or a fresh lambda paints from the database instead of waiting on GitHub.
 * The second tier is a pure optimisation and every part of it fails soft: a
 * database that is slow, absent or unreadable costs one Trees call and nothing
 * else.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get("owner")
  const repo = url.searchParams.get("repo")
  const requestedRef = url.searchParams.get("ref")
  const ref = requestedRef ?? "HEAD"
  const bypassCache = url.searchParams.get("refresh") === "1"

  // Both halves land in a GitHub API path. Anything holding a slash or a `..`
  // could address an endpoint other than this repository, so the shape is
  // checked here rather than trusted because it came from our own link.
  if (!owner || !repo || !isValidOwner(owner) || !isValidRepoName(repo)) {
    return NextResponse.json(
      { error: "owner-and-repo-required" },
      { status: 400 }
    )
  }

  const session = await readAccessToken(request)
  if (!session) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }
  if (session.expired) {
    // The caller refreshes through /api/github/refresh, the only route allowed
    // to rotate the token, and retries.
    return NextResponse.json({ error: "token-expired" }, { status: 401 })
  }

  /**
   * Only a listing of HEAD is cacheable.
   *
   * A request pinned to a commit SHA comes from `lib/exports/regenerate.ts`,
   * which must re-list a past export at exactly that revision. Serving it the
   * HEAD cache, or letting it overwrite the HEAD cache, would rebuild a
   * different document under the same date — the doubt the ledger exists to
   * remove.
   */
  const cacheable =
    (requestedRef === null || requestedRef === "HEAD") &&
    Boolean(session.githubId && session.githubLogin)

  if (cacheable && !bypassCache) {
    try {
      const user = await upsertUser(treeCacheDb, {
        githubId: session.githubId!,
        login: session.githubLogin!,
      })
      const cached = await readCachedTree(treeCacheDb, {
        userId: user.id,
        owner,
        name: repo,
      })
      if (cached) return NextResponse.json({ ...cached, cached: true })
    } catch {
      // A miss, not a failure. Nothing is logged: the error could name the
      // database or carry the connection string.
    }
  }

  try {
    const payload = await githubFetch(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      session.token
    )
    const tree = parseTreeResponse(payload)

    if (cacheable) {
      try {
        const user = await upsertUser(treeCacheDb, {
          githubId: session.githubId!,
          login: session.githubLogin!,
        })
        await writeCachedTree(treeCacheDb, {
          userId: user.id,
          repo: { owner, name: repo },
          tree,
        })
      } catch {
        // The listing is already in hand. Failing to remember it is not a
        // reason to withhold it.
      }
    }

    // `truncated` is surfaced, never swallowed: a large monorepo would
    // otherwise appear to simply not contain the missing files.
    return NextResponse.json({ ...tree, cached: false })
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.safeMessage
        : "Could not read the repository tree."
    return NextResponse.json(
      { error: message },
      { status: statusForError(error) }
    )
  }
}
