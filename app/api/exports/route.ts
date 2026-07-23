import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { exportsDb } from "@/lib/db/exports-db"
import { listExports, recordExport, upsertUser } from "@/lib/db/exports"
import { parseExportRequest } from "@/lib/exports/payload"

/**
 * The uniqueness ledger: `POST` records an export, `GET` lists them.
 *
 * This is the **only** write path in the app, which is why the payload is
 * parsed by a schema that names every field it keeps (`lib/exports/payload.ts`)
 * rather than being spread into Prisma. What lands in the database is a path, a
 * commit SHA, a content hash and a size — never a byte of source, never a PDF.
 *
 * Note what this route does **not** do: talk to GitHub. It records what the
 * browser already rendered, so it costs nothing against the API budget, and the
 * per-project stats built on `UsedFile.sizeBytes` cost nothing either.
 */

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

  const parsed = parseExportRequest(payload)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  try {
    // Upserted rather than looked up: the row is normally written at sign-in,
    // but that write is allowed to fail silently, so this is what guarantees it
    // exists before anything references it.
    const user = await upsertUser(exportsDb, {
      githubId: session.githubId,
      login: session.githubLogin,
    })

    const recorded = await recordExport(exportsDb, {
      userId: user.id,
      repo: parsed.value.repo,
      actualPages: parsed.value.actualPages,
      files: parsed.value.files,
    })

    return NextResponse.json(recorded, { status: 201 })
  } catch {
    // The message could name the database or carry the connection string.
    return NextResponse.json(
      { error: "Could not record this export." },
      { status: 500 }
    )
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.githubId || !session.githubLogin) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }

  try {
    const user = await upsertUser(exportsDb, {
      githubId: session.githubId,
      login: session.githubLogin,
    })
    return NextResponse.json({ exports: await listExports(exportsDb, user.id) })
  } catch {
    return NextResponse.json(
      { error: "Could not read your export history." },
      { status: 500 }
    )
  }
}
