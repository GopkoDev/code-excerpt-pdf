import { NextResponse } from "next/server"

import { githubFetch, statusForError } from "@/lib/github/client"
import { GitHubError } from "@/lib/github/errors"
import { readAccessToken } from "@/lib/github/session-token"
import { parseTreeResponse } from "@/lib/github/tree"

/**
 * One `recursive=1` Trees call per repository.
 *
 * SPEC's API budget rests on this being the only tree read: the whole file
 * list, including sizes, arrives in a single request, and the tree view then
 * runs on those sizes without fetching any content.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get("owner")
  const repo = url.searchParams.get("repo")
  const ref = url.searchParams.get("ref") ?? "HEAD"

  if (!owner || !repo) {
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

  try {
    const payload = await githubFetch(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      session.token
    )
    const tree = parseTreeResponse(payload)

    // `truncated` is surfaced, never swallowed: a large monorepo would
    // otherwise appear to simply not contain the missing files.
    return NextResponse.json(tree)
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
