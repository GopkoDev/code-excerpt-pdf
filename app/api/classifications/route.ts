import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { classificationsDb } from "@/lib/db/classifications-db"
import { listOverrides, saveOverride } from "@/lib/db/classifications"
import { findUser, upsertUser } from "@/lib/db/exports"
import { parseClassificationRequest } from "@/lib/classifications/payload"
import { isValidOwner, isValidRepoName } from "@/lib/github/repo-id"

/**
 * Manual vendored/authored overrides: `GET` lists them for one repository,
 * `POST` records one.
 *
 * Separate from `/api/exports` because it is a separate table with a separate
 * lifetime — an override is a standing decision about a path, not a record of
 * something that happened. Like the ledger route, it makes **no GitHub call**:
 * the answer is entirely in our own database.
 *
 * Nothing here can carry code. The payload schema names three fields, and the
 * `Classification` row holds a path, a verdict and two timestamps.
 */

export async function GET(request: Request) {
  const url = new URL(request.url)
  const owner = url.searchParams.get("owner")
  const repo = url.searchParams.get("repo")

  // The same shapes the GitHub routes refuse. These only reach a `where`
  // clause here, but they are the key an override is later stored under.
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
    const user = await findUser(classificationsDb, session.githubId)
    // A user who has never overridden anything has no row yet. That is an
    // empty list, not an error — everything is classified automatically.
    if (!user) return NextResponse.json({ overrides: [] })

    return NextResponse.json({
      overrides: await listOverrides(classificationsDb, {
        userId: user.id,
        owner,
        name: repo,
      }),
    })
  } catch {
    return NextResponse.json(
      { error: "Could not read your saved classifications." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.githubId || !session.githubLogin) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 })
  }

  const parsed = parseClassificationRequest(payload)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  try {
    // Upserted rather than looked up, for the same reason the export route
    // does it: the sign-in write is allowed to fail silently, so this is what
    // guarantees the row exists before anything references it.
    const user = await upsertUser(classificationsDb, {
      githubId: session.githubId,
      login: session.githubLogin,
    })

    await saveOverride(classificationsDb, {
      userId: user.id,
      repo: parsed.value.repo,
      override: parsed.value.override,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    // The message could name the database or carry the connection string.
    return NextResponse.json(
      { error: "Could not save this classification." },
      { status: 500 }
    )
  }
}
