import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { accountDb } from "@/lib/db/account-db"
import { exportAccountData } from "@/lib/db/account"

/**
 * The GDPR subject-access request: every row this service holds about the
 * signed-in account, as one downloadable JSON file.
 *
 * A route handler rather than a Server Action because the result is a *file* —
 * a plain `<a download>` is all the page needs, with no client JavaScript and
 * nothing buffered into an RSC payload on the way past.
 *
 * Completeness is not this file's job: `lib/db/account.ts` owns the inventory
 * of models and columns, and `lib/db/account.test.ts` pins it to
 * `prisma/schema.prisma` so a seventh model cannot go missing quietly. What
 * this file owns is that the answer reaches only the account it belongs to.
 *
 * No GitHub call, and nothing here can carry code: the payload is built from
 * named columns, and the one Json column in the schema is re-validated on its
 * way out.
 */
export async function GET() {
  const session = await auth()
  if (!session?.githubId) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }

  try {
    const payload = await exportAccountData(accountDb, session.githubId)

    // Indented: this is read by a person, and possibly by a regulator.
    const body = JSON.stringify(payload, null, 2)
    const day = payload.exportedAt.slice(0, 10)

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="code-excerpt-pdf-account-${day}.json"`,
        // Personal data, and a shared cache holding it would be a breach in
        // its own right.
        "Cache-Control": "no-store, private",
      },
    })
  } catch {
    // The message could name the database or carry the connection string.
    return NextResponse.json(
      { error: "Could not assemble your data export." },
      { status: 500 }
    )
  }
}
