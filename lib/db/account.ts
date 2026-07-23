/**
 * The two things GDPR obliges this service to be able to do — hand everything
 * over, and erase everything — behind one narrow port.
 *
 * Same shape and same reasoning as `exports.ts`: the Prisma client is a
 * parameter, so both operations are proven against an in-memory fake with no
 * database anywhere (`account.test.ts`). That matters more here than anywhere
 * else in the app, because these are the two operations whose failure mode is
 * silence — an export that quietly omits a table looks exactly like a complete
 * one, and so does a deletion that quietly leaves rows behind.
 *
 * ### Why the model list is written down
 *
 * `ACCOUNT_MODELS` is the complete inventory of persisted models, and the test
 * checks it against `prisma/schema.prisma` itself. Adding a seventh model
 * therefore fails the suite rather than falling silently out of both
 * operations. The two payload types below are built on it as well, so a new
 * model is a *compile* error before it is a test failure.
 *
 * ### Why deletion does not lean on the foreign keys
 *
 * Every relation in the schema declares `onDelete: Cascade`, so `user.delete`
 * alone would probably be enough. Probably is the problem: no migration in
 * this repository has ever been applied, so the cascade is a declaration that
 * has never once been observed, and "the FK will handle it" is not an answer
 * to a regulator. Each table is deleted explicitly, children before parents,
 * and the fake — which implements no cascade at all — is what proves the set
 * is complete. If the real cascade also fires, it finds nothing left to do.
 */

import { CachedTree } from "./tree-cache"

/**
 * Every persisted model, mapped to the section it occupies in the export.
 *
 * Keys are the Prisma model names, so `account.test.ts` can compare them with
 * `schema.prisma` directly; values are the JSON keys the user actually reads.
 */
export const ACCOUNT_MODELS = {
  User: "user",
  Repo: "repos",
  Export: "exports",
  UsedFile: "usedFiles",
  Classification: "classifications",
  TreeCache: "treeCaches",
} as const

export type AccountModel = keyof typeof ACCOUNT_MODELS
export type AccountSection = (typeof ACCOUNT_MODELS)[AccountModel]

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

type UserRow = {
  id: string
  githubId: string
  login: string
  createdAt: Date
}

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
  /** Json, so `unknown` — it is re-validated before it leaves the building. */
  tree: unknown
  fetchedAt: Date
}

type Batch = { count: number }

/**
 * The slice of the Prisma client these two operations use.
 *
 * `UsersDb` from `exports.ts` is deliberately *not* reused: that port narrows
 * `user.findUnique` to `{ id }`, and an export that returned only the id would
 * be exactly the quiet incompleteness this file exists to prevent.
 *
 * `UsedFile`, `Classification` and `TreeCache` hang off `Repo` rather than off
 * `User`, so they are reached through the same `{ repo: { userId } }` filter
 * `listUsedFiles` already uses. `Export` and `Repo` carry `userId` directly.
 */
export type AccountDb = {
  user: {
    findUnique(args: { where: { githubId: string } }): Promise<UserRow | null>
    delete(args: { where: { id: string } }): Promise<{ id: string }>
  }
  repo: {
    findMany(args: { where: { userId: string } }): Promise<RepoRow[]>
    deleteMany(args: { where: { userId: string } }): Promise<Batch>
  }
  export: {
    findMany(args: { where: { userId: string } }): Promise<ExportRow[]>
    deleteMany(args: { where: { userId: string } }): Promise<Batch>
  }
  usedFile: {
    findMany(args: {
      where: { repo: { userId: string } }
    }): Promise<UsedFileRow[]>
    deleteMany(args: { where: { repo: { userId: string } } }): Promise<Batch>
  }
  classification: {
    findMany(args: {
      where: { repo: { userId: string } }
    }): Promise<ClassificationRow[]>
    deleteMany(args: { where: { repo: { userId: string } } }): Promise<Batch>
  }
  treeCache: {
    findMany(args: {
      where: { repo: { userId: string } }
    }): Promise<TreeCacheRow[]>
    deleteMany(args: { where: { repo: { userId: string } } }): Promise<Batch>
  }
}

// ---------------------------------------------------------------------------
// The export payload
// ---------------------------------------------------------------------------

/** Dates leave as ISO 8601 strings; everything else is the column verbatim. */
export type UserExport = {
  id: string
  githubId: string
  login: string
  createdAt: string
}

export type RepoExport = {
  id: string
  userId: string
  owner: string
  name: string
  defaultBranch: string | null
  createdAt: string
}

export type ExportExport = {
  id: string
  userId: string
  repoId: string | null
  actualPages: number
  createdAt: string
}

export type UsedFileExport = {
  id: string
  repoId: string
  exportId: string
  path: string
  commitSha: string
  contentHash: string
  sizeBytes: number
  createdAt: string
}

export type ClassificationExport = {
  id: string
  repoId: string
  pathOrGlob: string
  kind: "VENDORED" | "AUTHORED"
  createdAt: string
  updatedAt: string
}

export type TreeCacheExport = {
  id: string
  repoId: string
  headSha: string
  /** `null` when the stored Json no longer matches the schema that wrote it. */
  tree: CachedTree | null
  fetchedAt: string
}

/**
 * The `Record` half is the guard: a seventh model adds a seventh section name,
 * and this type then refuses any payload that does not carry it.
 */
export type AccountExportData = Record<AccountSection, unknown> & {
  user: UserExport | null
  repos: RepoExport[]
  exports: ExportExport[]
  usedFiles: UsedFileExport[]
  classifications: ClassificationExport[]
  treeCaches: TreeCacheExport[]
}

export type AccountExport = {
  format: "code-excerpt-pdf.account-export"
  formatVersion: 1
  exportedAt: string
  /** Written into the file itself, because the file outlives this codebase. */
  notice: string
  data: AccountExportData
}

const NOTICE =
  "Everything this service stores about your account. It holds no source " +
  "code, no generated PDFs and no GitHub credentials: file paths, commit " +
  "SHAs, content hashes and sizes only. Your GitHub access token lives in " +
  "an encrypted session cookie and is never written to the database."

const iso = (date: Date) => date.toISOString()

/**
 * Every row this service holds about one account, in one JSON document.
 *
 * An account with no `User` row is a real and ordinary answer — the sign-in
 * upsert is allowed to fail silently, and anonymous mode needs no row at all —
 * so it returns an empty export rather than an error.
 */
export async function exportAccountData(
  db: AccountDb,
  githubId: string,
  { now = new Date() }: { now?: Date } = {}
): Promise<AccountExport> {
  const envelope = {
    format: "code-excerpt-pdf.account-export",
    formatVersion: 1,
    exportedAt: iso(now),
    notice: NOTICE,
  } as const

  const user = await db.user.findUnique({ where: { githubId } })
  if (!user) {
    return {
      ...envelope,
      data: {
        user: null,
        repos: [],
        exports: [],
        usedFiles: [],
        classifications: [],
        treeCaches: [],
      },
    }
  }

  const scope = { where: { userId: user.id } }
  const owned = { where: { repo: { userId: user.id } } }

  const [repos, exports, usedFiles, classifications, treeCaches] =
    await Promise.all([
      db.repo.findMany(scope),
      db.export.findMany(scope),
      db.usedFile.findMany(owned),
      db.classification.findMany(owned),
      db.treeCache.findMany(owned),
    ])

  return {
    ...envelope,
    data: {
      user: {
        id: user.id,
        githubId: user.githubId,
        login: user.login,
        createdAt: iso(user.createdAt),
      },
      repos: repos.map((row) => ({ ...row, createdAt: iso(row.createdAt) })),
      exports: exports.map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
      })),
      usedFiles: usedFiles.map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
      })),
      classifications: classifications.map((row) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      treeCaches: treeCaches.map((row) => ({
        id: row.id,
        repoId: row.repoId,
        headSha: row.headSha,
        // Re-validated on the way out, not spread. This is the only Json
        // column in the schema, so it is the only value in the export that is
        // not a column with a known type — and a subject-access request must
        // not be the one path that hands back whatever happens to be in it.
        tree: CachedTree.safeParse(row.tree).data ?? null,
        fetchedAt: iso(row.fetchedAt),
      })),
    },
  }
}

/**
 * How many rows were erased, per model.
 *
 * Typed as a total map over `ACCOUNT_MODELS`, so a seventh model stops this
 * file compiling until it is actually deleted — the compile-time half of the
 * completeness guarantee `account.test.ts` asserts at runtime.
 */
export type AccountDeletion = Record<AccountModel, number>

/**
 * Erases the account and everything hanging off it.
 *
 * Children before parents, so an interrupted deletion leaves an intact account
 * holding less data rather than orphaned rows or a "deleted" user whose paths
 * are still stored. Deliberately not wrapped in a transaction: the Neon driver
 * adapter is the only thing that has ever been configured here and nothing in
 * this repository has ever exercised an interactive transaction against it, so
 * the honest design is one that is safe to simply run again. It is idempotent —
 * a second call finds nothing and reports zeroes.
 */
export async function deleteAccount(
  db: AccountDb,
  githubId: string
): Promise<AccountDeletion> {
  const user = await db.user.findUnique({ where: { githubId } })
  if (!user) {
    return {
      User: 0,
      Repo: 0,
      Export: 0,
      UsedFile: 0,
      Classification: 0,
      TreeCache: 0,
    }
  }

  const scope = { where: { userId: user.id } }
  const owned = { where: { repo: { userId: user.id } } }

  // Sequential on purpose: the order is the safety property.
  const usedFiles = await db.usedFile.deleteMany(owned)
  const classifications = await db.classification.deleteMany(owned)
  const treeCaches = await db.treeCache.deleteMany(owned)
  const exports = await db.export.deleteMany(scope)
  const repos = await db.repo.deleteMany(scope)
  await db.user.delete({ where: { id: user.id } })

  return {
    UsedFile: usedFiles.count,
    Classification: classifications.count,
    TreeCache: treeCaches.count,
    Export: exports.count,
    Repo: repos.count,
    User: 1,
  }
}
