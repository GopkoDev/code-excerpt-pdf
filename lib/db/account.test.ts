import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  ACCOUNT_MODELS,
  deleteAccount,
  exportAccountData,
  type AccountDb,
} from "@/lib/db/account"

/**
 * The GDPR pair, proven with no database anywhere.
 *
 * Two claims are made to a regulator here, and both are easy to make and easy
 * to get quietly wrong:
 *
 * 1. **The export is complete.** It must contain every row the service holds
 *    about the user — every model, and every column of every model. Covering
 *    "the ones that came to mind" is the normal failure, and it stays
 *    invisible until someone asks.
 * 2. **The deletion is complete.** The foreign keys are declared to cascade,
 *    but nothing in this repository has ever run against a database, so that
 *    cascade is a claim rather than an observation. `deleteAccount` therefore
 *    deletes each table explicitly, and this file proves it row by row against
 *    a fake that implements **no** cascade of its own — a fake that cascaded
 *    would only be re-encoding the assumption under test.
 *
 * Both claims are anchored to `prisma/schema.prisma` rather than to a list
 * written here, so **adding a seventh model fails this suite** instead of
 * silently falling out of the export and out of the delete.
 */

const SCHEMA = readFileSync(
  join(import.meta.dirname, "..", "..", "prisma", "schema.prisma"),
  "utf8"
)

/** `model X { … }` bodies, in declaration order. */
const MODELS = [...SCHEMA.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(
  (match) => ({ name: match[1], body: match[2] })
)

const MODEL_NAMES = MODELS.map((model) => model.name)

/**
 * The columns of one model — every field whose type is not another model. A
 * relation field is not a column; its foreign key (`repoId`) is, and the
 * schema declares that separately.
 */
function columnsOf(name: string): string[] {
  const model = MODELS.find((candidate) => candidate.name === name)
  if (!model) throw new Error(`No model ${name} in schema.prisma`)

  return [...model.body.matchAll(/^ {2}(\w+)\s+(\w+)(\[\])?\??/gm)]
    .filter((match) => !MODEL_NAMES.includes(match[2]))
    .map((match) => match[1])
}

// ---------------------------------------------------------------------------
// The fake: six arrays and the `where` clauses the port actually uses. No
// cascade and no referential integrity, because those are what is under test.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

type UserRow = { id: string; githubId: string; login: string; createdAt: Date }
type RepoRow = {
  id: string
  userId: string
  owner: string
  name: string
  defaultBranch: string | null
  createdAt: Date
}
type ExportRow = {
  id: string
  userId: string
  repoId: string | null
  actualPages: number
  createdAt: Date
}
type UsedFileRow = {
  id: string
  repoId: string
  exportId: string
  path: string
  commitSha: string
  contentHash: string
  sizeBytes: number
  createdAt: Date
}
type ClassificationRow = {
  id: string
  repoId: string
  pathOrGlob: string
  kind: "VENDORED" | "AUTHORED"
  createdAt: Date
  updatedAt: Date
}
type TreeCacheRow = {
  id: string
  repoId: string
  headSha: string
  tree: unknown
  fetchedAt: Date
}

function createFakeDb() {
  const users: UserRow[] = []
  const repos: RepoRow[] = []
  const exports: ExportRow[] = []
  const usedFiles: UsedFileRow[] = []
  const classifications: ClassificationRow[] = []
  const treeCaches: TreeCacheRow[] = []

  /**
   * The same arrays, keyed by **model name**, so every assertion below can
   * iterate the schema instead of a hand-written list. A seventh model has to
   * appear here before it can be seeded, exported or deleted — which is the
   * point.
   */
  const tables: Record<string, Row[]> = {
    User: users,
    Repo: repos,
    Export: exports,
    UsedFile: usedFiles,
    Classification: classifications,
    TreeCache: treeCaches,
  }

  const repoIdsOf = (userId: string) =>
    new Set(repos.filter((row) => row.userId === userId).map((row) => row.id))

  /** `{ where: { repo: { userId } } }`, resolved the long way round. */
  const ownedBy = <T extends { repoId: string }>(rows: T[], userId: string) => {
    const ids = repoIdsOf(userId)
    return rows.filter((row) => ids.has(row.repoId))
  }

  /** Removes in place, so the `tables` view keeps pointing at one array. */
  const drop = <T>(rows: T[], doomed: T[]) => {
    for (const row of doomed) rows.splice(rows.indexOf(row), 1)
    return { count: doomed.length }
  }

  const db: AccountDb = {
    user: {
      async findUnique({ where }) {
        return users.find((row) => row.githubId === where.githubId) ?? null
      },
      async delete({ where }) {
        const found = users.find((row) => row.id === where.id)
        if (!found) throw new Error("Record to delete does not exist.")
        drop(users, [found])
        return { id: found.id }
      },
    },
    repo: {
      async findMany({ where }) {
        return repos.filter((row) => row.userId === where.userId)
      },
      async deleteMany({ where }) {
        return drop(
          repos,
          repos.filter((row) => row.userId === where.userId)
        )
      },
    },
    export: {
      async findMany({ where }) {
        return exports.filter((row) => row.userId === where.userId)
      },
      async deleteMany({ where }) {
        return drop(
          exports,
          exports.filter((row) => row.userId === where.userId)
        )
      },
    },
    usedFile: {
      async findMany({ where }) {
        return ownedBy(usedFiles, where.repo.userId)
      },
      async deleteMany({ where }) {
        return drop(usedFiles, ownedBy(usedFiles, where.repo.userId))
      },
    },
    classification: {
      async findMany({ where }) {
        return ownedBy(classifications, where.repo.userId)
      },
      async deleteMany({ where }) {
        return drop(
          classifications,
          ownedBy(classifications, where.repo.userId)
        )
      },
    },
    treeCache: {
      async findMany({ where }) {
        return ownedBy(treeCaches, where.repo.userId)
      },
      async deleteMany({ where }) {
        return drop(treeCaches, ownedBy(treeCaches, where.repo.userId))
      },
    },
  }

  return { db, tables }
}

let sequence = 0
const at = (offset: number) => new Date(1_700_000_000_000 + offset * 1000)

/**
 * One row in **every** table, for one account.
 *
 * Written through the name-keyed view rather than through the port, because
 * the port has no writers — this is the state a real account arrives in, not a
 * state the port can produce.
 */
function seedAccount(
  tables: Record<string, Row[]>,
  { githubId, login }: { githubId: string; login: string }
) {
  const suffix = `${++sequence}`
  const userId = `u${suffix}`
  const repoId = `r${suffix}`
  const exportId = `e${suffix}`

  tables.User.push({ id: userId, githubId, login, createdAt: at(1) })
  tables.Repo.push({
    id: repoId,
    userId,
    owner: login,
    name: `repo-${suffix}`,
    defaultBranch: "main",
    createdAt: at(2),
  })
  tables.Export.push({
    id: exportId,
    userId,
    repoId,
    actualPages: 12,
    createdAt: at(3),
  })
  tables.UsedFile.push({
    id: `f${suffix}`,
    repoId,
    exportId,
    path: "src/a.ts",
    commitSha: "a".repeat(40),
    contentHash: "b".repeat(64),
    sizeBytes: 1024,
    createdAt: at(4),
  })
  tables.Classification.push({
    id: `c${suffix}`,
    repoId,
    pathOrGlob: "components/ui/",
    kind: "VENDORED",
    createdAt: at(5),
    updatedAt: at(6),
  })
  tables.TreeCache.push({
    id: `t${suffix}`,
    repoId,
    headSha: "c".repeat(40),
    tree: {
      truncated: false,
      files: [{ path: "src/a.ts", sizeBytes: 1024, blobSha: "d".repeat(40) }],
    },
    fetchedAt: at(7),
  })

  return { userId, repoId, exportId }
}

const account = { githubId: "42", login: "octo" }

const sectionFor = (model: string) =>
  ACCOUNT_MODELS[model as keyof typeof ACCOUNT_MODELS]

/** "Has something in it", for a section that is a list or a single row. */
const isPopulated = (value: unknown) =>
  Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined

// ---------------------------------------------------------------------------

describe("the model inventory", () => {
  /**
   * The guard the rest of the file rests on. `ACCOUNT_MODELS` is the list both
   * the export and the delete iterate; if it and the schema ever disagree, a
   * model's data is quietly neither handed over nor erased.
   */
  it("names exactly the models declared in schema.prisma", () => {
    expect(Object.keys(ACCOUNT_MODELS).sort()).toEqual([...MODEL_NAMES].sort())
  })

  it("is seeded in full by the fixture, model for model", () => {
    const { tables } = createFakeDb()
    seedAccount(tables, account)

    expect(Object.keys(tables).sort()).toEqual([...MODEL_NAMES].sort())
    for (const model of MODEL_NAMES) {
      expect(tables[model], `${model} was never seeded`).toHaveLength(1)
    }
  })
})

describe("exportAccountData", () => {
  it("returns one section per model, and every one of them is populated", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    const payload = await exportAccountData(db, account.githubId)

    expect(Object.keys(payload.data).sort()).toEqual(
      Object.values(ACCOUNT_MODELS).slice().sort()
    )
    for (const model of MODEL_NAMES) {
      expect(
        isPopulated(payload.data[sectionFor(model)]),
        `${model} is missing from the export`
      ).toBe(true)
    }
  })

  /**
   * Completeness one level down: a column nobody thought about is as absent
   * from a subject-access request as a table nobody thought about.
   */
  it("carries every column of every model", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    const payload = await exportAccountData(db, account.githubId)

    for (const model of MODEL_NAMES) {
      const section = payload.data[sectionFor(model)]
      const row = (Array.isArray(section) ? section[0] : section) as Row
      expect(Object.keys(row).sort(), `${model} columns`).toEqual(
        columnsOf(model).sort()
      )
    }
  })

  /**
   * The NDA constraint, asserted rather than assumed. `TreeCache.tree` is the
   * only Json column in the schema and therefore the only place a file's
   * content could ride out of the database — so the export runs it back
   * through the same Zod schema that guarded it on the way in.
   */
  it("contains no source code and no credential, anywhere in the payload", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)
    // A row as a future, buggier version of the cache writer might have left
    // it. Nothing may carry it back out.
    const cached = tables.TreeCache[0].tree as { files: Row[] }
    cached.files[0].content = "export const secret = 1"

    const payload = await exportAccountData(db, account.githubId)

    expect(JSON.stringify(payload)).not.toContain("export const secret")
    for (const key of collectKeys(payload.data)) {
      expect(FORBIDDEN_KEYS.has(key), `export carries a "${key}" field`).toBe(
        false
      )
    }
    for (const value of collectStrings(payload.data)) {
      expect(value).not.toMatch(/gh[pousr]_|github_pat_/)
    }
  })

  it("never exports another account's rows", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)
    seedAccount(tables, { githubId: "99", login: "someone-else" })

    const payload = await exportAccountData(db, account.githubId)

    expect(payload.data.user?.login).toBe("octo")
    expect(payload.data.repos).toHaveLength(1)
    expect(payload.data.exports).toHaveLength(1)
    expect(payload.data.usedFiles).toHaveLength(1)
    expect(payload.data.classifications).toHaveLength(1)
    expect(payload.data.treeCaches).toHaveLength(1)
  })

  /**
   * The sign-in upsert is allowed to fail silently and anonymous mode needs no
   * row at all, so "we hold nothing about you" is a real answer and must not
   * read as an error.
   */
  it("answers with an empty export when the account has no row", async () => {
    const { db } = createFakeDb()

    const payload = await exportAccountData(db, "does-not-exist")

    expect(payload.data.user).toBeNull()
    for (const model of MODEL_NAMES.filter((name) => name !== "User")) {
      expect(payload.data[sectionFor(model)]).toEqual([])
    }
  })
})

describe("deleteAccount", () => {
  it("leaves not one row behind, in any model", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    await deleteAccount(db, account.githubId)

    for (const model of MODEL_NAMES) {
      expect(tables[model], `${model} still holds data`).toHaveLength(0)
    }
  })

  it("reports what it removed, model by model", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    const removed = await deleteAccount(db, account.githubId)

    for (const model of MODEL_NAMES) {
      expect(
        removed[model as keyof typeof removed],
        `${model} was not counted`
      ).toBe(1)
    }
  })

  it("touches nothing belonging to another account", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)
    seedAccount(tables, { githubId: "99", login: "someone-else" })

    await deleteAccount(db, account.githubId)

    for (const model of MODEL_NAMES) {
      expect(tables[model], `${model} lost a bystander's row`).toHaveLength(1)
    }
    expect(tables.User[0].githubId).toBe("99")
  })

  /**
   * Children first, parent last — the whole reason this is a sequence of
   * explicit deletes rather than one `user.delete` trusting the foreign keys.
   * If a statement fails halfway, what is left is an intact account holding
   * less data: never an orphaned row whose owner is gone, and never a user who
   * has been told they are deleted while their paths are still stored.
   */
  it("deletes children before the row they hang off", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    const { watched, order } = recordDeleteOrder(db)
    await deleteAccount(watched, account.githubId)

    const before = (child: string, parent: string) =>
      expect(
        order.indexOf(child),
        `${child} must be deleted before ${parent}, got ${order.join(" → ")}`
      ).toBeLessThan(order.indexOf(parent))

    before("usedFile", "export")
    before("usedFile", "repo")
    before("classification", "repo")
    before("treeCache", "repo")
    before("export", "user")
    before("repo", "user")
  })

  it("is idempotent — deleting an account that is already gone is not an error", async () => {
    const { db, tables } = createFakeDb()
    seedAccount(tables, account)

    await deleteAccount(db, account.githubId)
    const second = await deleteAccount(db, account.githubId)

    expect(second.User).toBe(0)
  })
})

// ---------------------------------------------------------------------------

/** Wraps every model so each `delete`/`deleteMany` records its own name. */
function recordDeleteOrder(db: AccountDb) {
  const order: string[] = []

  const watched = Object.fromEntries(
    Object.entries(db).map(([model, methods]) => [
      model,
      Object.fromEntries(
        Object.entries(methods as Record<string, unknown>).map(
          ([method, implementation]) => [
            method,
            method.startsWith("delete")
              ? (...args: unknown[]) => {
                  order.push(model)
                  return (implementation as (...a: unknown[]) => unknown)(
                    ...args
                  )
                }
              : implementation,
          ]
        )
      ),
    ])
  ) as AccountDb

  return { watched, order }
}

/**
 * Field names that would mean the payload carries the file itself rather than
 * a reference to it, or a credential. Matched exactly, so `contentHash`,
 * `sizeBytes` and `blobSha` are fine and a bare `content` is not — the same
 * list `prisma/migrations.test.ts` applies to the SQL.
 */
const FORBIDDEN_KEYS = new Set([
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

function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, into))
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key)
      collectKeys(nested, into)
    }
  }
  return into
}

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") {
    into.push(value)
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, into))
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((nested) => collectStrings(nested, into))
  }
  return into
}
