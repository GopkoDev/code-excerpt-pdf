import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { exportsDb } from "@/lib/db/exports-db"
import { findUser, listUsedFiles } from "@/lib/db/exports"
import { isValidOwner, isValidRepoName } from "@/lib/github/repo-id"

/**
 * The ledger for one repository — what marks a listing `used`.
 *
 * Separate from `GET /api/exports` because it answers a different question at
 * a different moment: the history page wants every export, the repository page
 * wants only "which paths of this repo are already filed", on open, for one
 * repo. Overloading one route with a mode flag would have made both callers
 * read a response shaped for the other.
 *
 * No GitHub call, by construction — the answer is entirely in our own database,
 * and `sizeBytes` rides along so per-project stats need no blob either.
 */

export async function GET(request: Request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get("owner")
  const repo = url.searchParams.get("repo")

  // Same shapes the GitHub routes refuse. These are only used in a `where`
  // clause here, but the values come back out as ledger keys the export path
  // then trusts.
  if (!owner || !repo || !isValidOwner(owner) || !isValidRepoName(repo)) {
    return NextResponse.json(
      { error: "owner-and-repo-required" },
      { status: 400 }
    )
  }

  const session = await auth()
  if (!session?.githubId) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }

  try {
    const user = await findUser(exportsDb, session.githubId)
    // A user who has never exported has no row yet. That is an empty ledger,
    // not an error — every file is simply still available.
    if (!user) return NextResponse.json({ usedFiles: [] })

    return NextResponse.json({
      usedFiles: await listUsedFiles(exportsDb, {
        userId: user.id,
        owner,
        name: repo,
      }),
    })
  } catch {
    return NextResponse.json(
      { error: "Could not read what has already been exported." },
      { status: 500 }
    )
  }
}
