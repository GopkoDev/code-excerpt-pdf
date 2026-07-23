import { describe, expect, it } from "vitest"

import {
  listExports,
  listUsedFiles,
  recordExport,
  upsertUser,
  type ExportsDb,
} from "@/lib/db/exports"

/**
 * An in-memory stand-in for the Prisma client.
 *
 * There is no database to talk to here — migration 1 has not been applied —
 * and there should not need to be one. `lib/db/exports.ts` takes the client as
 * a parameter precisely so the rules that matter (a repo is reused rather than
 * duplicated, one `UsedFile` per file, the ledger never crosses users) can be
 * proven against a fake. It honours `where`/`orderBy` rather than merely
 * recording calls, so these are behaviour tests, not shape assertions.
 */
function createFakeDb() {
  type UserRow = { id: string; githubId: string; login: string }
  type RepoRow = {
    id: string
    userId: string
    owner: string
    name: string
    /** Nullable in the schema, so nullable here — `undefined` is "unchanged". */
    defaultBranch: string | null
  }
  type ExportRow = {
    id: string
    userId: string
    repoId: string
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

  const users: UserRow[] = []
  const repos: RepoRow[] = []
  const exports: ExportRow[] = []
  const usedFiles: UsedFileRow[] = []

  let sequence = 0
  const nextId = (prefix: string) => `${prefix}${++sequence}`
  // Distinct, monotonic timestamps — `Date.now()` would tie inside one test.
  const nextDate = () => new Date(1_700_000_000_000 + ++sequence * 1000)

  const db: ExportsDb = {
    user: {
      async upsert({ where, create, update }) {
        const found = users.find((row) => row.githubId === where.githubId)
        if (found) {
          found.login = update.login
          return found
        }
        const row = { id: nextId("u"), ...create }
        users.push(row)
        return row
      },
      async findUnique({ where }) {
        return users.find((row) => row.githubId === where.githubId) ?? null
      },
    },
    repo: {
      async upsert({ where, create, update }) {
        const key = where.userId_owner_name
        const found = repos.find(
          (row) =>
            row.userId === key.userId &&
            row.owner === key.owner &&
            row.name === key.name
        )
        if (found) {
          // Prisma skips an `undefined` field rather than nulling the column.
          if (update.defaultBranch !== undefined) {
            found.defaultBranch = update.defaultBranch
          }
          return found
        }
        const row = {
          id: nextId("r"),
          ...create,
          defaultBranch: create.defaultBranch ?? null,
        }
        repos.push(row)
        return row
      },
    },
    export: {
      async create({ data }) {
        const row = {
          id: nextId("e"),
          userId: data.userId,
          repoId: data.repoId,
          actualPages: data.actualPages,
          createdAt: nextDate(),
        }
        exports.push(row)
        data.usedFiles.create.forEach((file) =>
          usedFiles.push({
            id: nextId("f"),
            exportId: row.id,
            createdAt: nextDate(),
            ...file,
          })
        )
        return row
      },
      async findMany({ where, orderBy }) {
        const direction = orderBy.createdAt === "desc" ? -1 : 1
        return exports
          .filter((row) => row.userId === where.userId)
          .slice()
          .sort(
            (a, b) =>
              direction * (a.createdAt.getTime() - b.createdAt.getTime())
          )
          .map((row) => ({
            ...row,
            repo: repos.find((repo) => repo.id === row.repoId) ?? null,
            usedFiles: usedFiles.filter((file) => file.exportId === row.id),
          }))
      },
    },
    usedFile: {
      async findMany({ where }) {
        const scoped = repos.filter(
          (repo) =>
            repo.userId === where.repo.userId &&
            repo.owner === where.repo.owner &&
            repo.name === where.repo.name
        )
        const ids = new Set(scoped.map((repo) => repo.id))
        return usedFiles.filter((file) => ids.has(file.repoId))
      },
    },
  }

  return { db, users, repos, exports, usedFiles }
}

const file = (path: string, overrides: Partial<ExportedFile> = {}) => ({
  path,
  commitSha: "a".repeat(40),
  contentHash: "b".repeat(64),
  sizeBytes: 100,
  ...overrides,
})

type ExportedFile = {
  path: string
  commitSha: string
  contentHash: string
  sizeBytes: number
}

const repo = { owner: "octo", name: "hello", defaultBranch: "main" }

describe("upsertUser", () => {
  it("creates the row the first time and reuses it after", async () => {
    const { db, users } = createFakeDb()

    const first = await upsertUser(db, { githubId: "42", login: "octo" })
    const second = await upsertUser(db, { githubId: "42", login: "octocat" })

    expect(second.id).toBe(first.id)
    expect(users).toHaveLength(1)
    // A rename must follow the account, or the history page names the wrong
    // person for every past export.
    expect(users[0].login).toBe("octocat")
  })
})

describe("recordExport", () => {
  it("writes one UsedFile per file, carrying the pinned metadata", async () => {
    const { db, usedFiles } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 7,
      files: [
        file("src/a.ts", { contentHash: "hash-a", sizeBytes: 10 }),
        file("src/b.ts", { contentHash: "hash-b", sizeBytes: 20 }),
      ],
    })

    expect(usedFiles.map((row) => row.path)).toEqual(["src/a.ts", "src/b.ts"])
    expect(usedFiles.map((row) => row.contentHash)).toEqual([
      "hash-a",
      "hash-b",
    ])
    expect(usedFiles.map((row) => row.sizeBytes)).toEqual([10, 20])
  })

  /**
   * The NDA constraint, asserted rather than assumed: nothing that reaches the
   * database may carry file content. If a field is ever added that could, this
   * test fails before the migration is written.
   */
  it("persists metadata only — no content, no text of any kind", async () => {
    const { db, usedFiles } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 1,
      files: [file("src/a.ts")],
    })

    expect(Object.keys(usedFiles[0]).sort()).toEqual([
      "commitSha",
      "contentHash",
      "createdAt",
      "exportId",
      "id",
      "path",
      "repoId",
      "sizeBytes",
    ])
  })

  it("reuses the repo row across exports instead of duplicating it", async () => {
    const { db, repos } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 1,
      files: [file("a.ts")],
    })
    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 2,
      files: [file("b.ts")],
    })

    expect(repos).toHaveLength(1)
  })

  /**
   * The payload arrives over the network, so a repeated path is possible even
   * though the selection is a Set. Two rows for one file would double-count it
   * in the per-project stats.
   */
  it("collapses a path repeated inside one payload", async () => {
    const { db, usedFiles } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 1,
      files: [
        file("a.ts", { contentHash: "first" }),
        file("a.ts", { contentHash: "second" }),
      ],
    })

    expect(usedFiles).toHaveLength(1)
    expect(usedFiles[0].contentHash).toBe("second")
  })

  /**
   * An export of nothing produces no PDF, so recording one would only put a
   * row in the history that can never be re-downloaded.
   */
  it("refuses an export with no files", async () => {
    const { db } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await expect(
      recordExport(db, { userId: user.id, repo, actualPages: 0, files: [] })
    ).rejects.toThrow(/no files/i)
  })
})

describe("listExports", () => {
  it("returns the newest export first", async () => {
    const { db } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 1,
      files: [file("a.ts")],
    })
    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 2,
      files: [file("b.ts")],
    })

    const history = await listExports(db, user.id)
    expect(history.map((row) => row.actualPages)).toEqual([2, 1])
    expect(history[0].repo).toEqual({
      owner: "octo",
      name: "hello",
      defaultBranch: "main",
    })
    expect(history[0].files).toEqual([
      {
        path: "b.ts",
        commitSha: "a".repeat(40),
        contentHash: "b".repeat(64),
        sizeBytes: 100,
      },
    ])
  })

  it("never returns another user's exports", async () => {
    const { db } = createFakeDb()
    const mine = await upsertUser(db, { githubId: "1", login: "me" })
    const theirs = await upsertUser(db, { githubId: "2", login: "you" })

    await recordExport(db, {
      userId: theirs.id,
      repo,
      actualPages: 5,
      files: [file("secret.ts")],
    })

    expect(await listExports(db, mine.id)).toEqual([])
  })
})

describe("listUsedFiles", () => {
  it("returns the ledger for one repo of one user", async () => {
    const { db } = createFakeDb()
    const user = await upsertUser(db, { githubId: "42", login: "octo" })

    await recordExport(db, {
      userId: user.id,
      repo,
      actualPages: 1,
      files: [file("a.ts", { contentHash: "hash-a", sizeBytes: 11 })],
    })
    await recordExport(db, {
      userId: user.id,
      repo: { ...repo, name: "other" },
      actualPages: 1,
      files: [file("b.ts")],
    })

    const ledger = await listUsedFiles(db, {
      userId: user.id,
      owner: "octo",
      name: "hello",
    })

    expect(ledger).toEqual([
      {
        path: "a.ts",
        commitSha: "a".repeat(40),
        contentHash: "hash-a",
        sizeBytes: 11,
      },
    ])
  })

  it("does not leak another user's ledger for the same repository", async () => {
    const { db } = createFakeDb()
    const mine = await upsertUser(db, { githubId: "1", login: "me" })
    const theirs = await upsertUser(db, { githubId: "2", login: "you" })

    await recordExport(db, {
      userId: theirs.id,
      repo,
      actualPages: 1,
      files: [file("a.ts")],
    })

    expect(
      await listUsedFiles(db, {
        userId: mine.id,
        owner: "octo",
        name: "hello",
      })
    ).toEqual([])
  })
})
