import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The migrations are the artifact Checkpoint D reviews — so they are pinned by
 * a test rather than by a comment.
 *
 * Two invariants, both from `docs/tasks/plan.md`:
 *
 * 1. **One concern per migration.** `pg_dump`-and-grep is meaningful on a
 *    four-model diff and worthless on a six-model one, so `Classification`
 *    (migration 2) and `TreeCache` (migration 3) must each arrive in a folder
 *    of their own. Collapsing them back into `_init` fails here.
 * 2. **No column may be content-shaped.** SPEC's hard constraint is that no
 *    source code is ever stored; `lib/db/exports.test.ts` asserts it against the
 *    port, and this asserts it against the SQL that actually reaches Postgres.
 *
 * These read the checked-in SQL, not a database. Nothing here connects.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations")

type Migration = { name: string; sql: string }

function readMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }))
}

const createdTables = (sql: string): string[] =>
  [...sql.matchAll(/CREATE TABLE "([A-Za-z0-9_]+)"/g)].map(
    (match) => match[1]
  )

/** Every quoted column declaration in a CREATE TABLE body. */
const declaredColumns = (sql: string): string[] =>
  [...sql.matchAll(/^\s+"([A-Za-z0-9_]+)"\s+[A-Z]/gm)].map((match) => match[1])

/**
 * Names that would mean the row carries the file itself rather than a
 * reference to it. `contentHash` and `sizeBytes` are fine — the match is
 * exact, not a substring — but a bare `content` or `text` column is the
 * failure this whole architecture exists to prevent.
 */
const CONTENT_SHAPED = new Set([
  "content",
  "text",
  "body",
  "source",
  "code",
  "blob",
  "bytes",
  "data",
  "pdf",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "password",
])

describe("prisma migrations", () => {
  const migrations = readMigrations()

  it("keeps migration 1 to the four models Checkpoint D reviews", () => {
    const init = migrations.find((migration) => migration.name.endsWith("_init"))
    expect(init).toBeDefined()
    expect(createdTables(init!.sql).sort()).toEqual([
      "Export",
      "Repo",
      "UsedFile",
      "User",
    ])
  })

  it("never creates the same table twice", () => {
    const all = migrations.flatMap((migration) => createdTables(migration.sql))
    expect(all).toEqual([...new Set(all)])
  })

  it("declares no column that could hold source code or a credential", () => {
    for (const migration of migrations) {
      for (const column of declaredColumns(migration.sql)) {
        expect(
          CONTENT_SHAPED.has(column),
          `${migration.name} declares a content-shaped column "${column}"`
        ).toBe(false)
      }
    }
  })
})
