import { NextResponse } from "next/server"

import { decodeBlobResponse } from "@/lib/github/blob"
import { githubFetch, statusForError } from "@/lib/github/client"
import { GitHubError } from "@/lib/github/errors"
import { isValidOwner, isValidRepoName } from "@/lib/github/repo-id"
import { readAccessToken } from "@/lib/github/session-token"

/**
 * One file's content, fetched lazily for a selected file only.
 *
 * Returns base64 rather than raw bytes so the response stays JSON, and so the
 * client hashes exactly what GitHub served — the content hash must be taken
 * over the raw bytes, before any normalization.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get("owner")
  const repo = url.searchParams.get("repo")
  const sha = url.searchParams.get("sha")

  // Checked, not trusted: all three are interpolated into a GitHub API path,
  // and a value carrying a slash or a `..` could reach a different endpoint.
  // A blob sha is hex — 40 characters today, 64 in a sha256 repository.
  if (
    !owner ||
    !repo ||
    !sha ||
    !isValidOwner(owner) ||
    !isValidRepoName(repo) ||
    !/^[0-9a-f]{40,64}$/.test(sha)
  ) {
    return NextResponse.json(
      { error: "owner-repo-and-sha-required" },
      { status: 400 }
    )
  }

  const session = await readAccessToken(request)
  if (!session) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }
  if (session.expired) {
    return NextResponse.json({ error: "token-expired" }, { status: 401 })
  }

  try {
    const payload = await githubFetch(
      `/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(sha)}`,
      session.token
    )
    // Decoded here purely to validate: a blob GitHub declined to inline must
    // fail now, not as a blank page in the exported PDF.
    const bytes = decodeBlobResponse(payload)

    return NextResponse.json({
      sizeBytes: bytes.length,
      base64: Buffer.from(bytes).toString("base64"),
    })
  } catch (error) {
    const message =
      error instanceof GitHubError
        ? error.safeMessage
        : "Could not read that file."
    return NextResponse.json(
      { error: message },
      { status: statusForError(error) }
    )
  }
}
