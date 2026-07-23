import { describe, expect, it } from "vitest"

import {
  listOverrides,
  saveOverride,
  type ClassificationsDb,
} from "@/lib/db/classifications"
import { createVendoredResolver } from "@/lib/vendored"

/**
 * The same in-memory stand-in pattern `exports.test.ts` uses, for the same
 * reason: no migration has been applied, so there is no database to talk to —
 * and the rules worth proving (an override is reused rather than duplicated, a
 * folder rule keeps its cascade, one user never sees another's) do not need
 * one. The fake honours `where`, so these are behaviour tests.
 */
function createFakeDb() {
  type RepoRow = {
    id: string
    userId: string
    owner: string
    name: string
    defaultBranch: string | null
  }
  type ClassificationRow = {
    id: string
    repoId: string
    pathOrGlob: string
    kind: "VENDORED" | "AUTHORED"
    createdAt: Date
    updatedAt: Date
  }

  const repos: RepoRow[] = []
  const classifications: ClassificationRow[] = []

  let sequence = 0
  const nextId = (prefix: string) => `${prefix}${++sequence}`
  const nextDate = () => new Date(1_700_000_000_000 + ++sequence * 1000)

  const findRepo = (key: { userId: string; owner: string; name: string }) =>
    repos.find(
      (row) =>
        row.userId === key.userId &&
        row.owner === key.owner &&
        row.name === key.name
    ) ?? null

  const db: ClassificationsDb = {
    // Identity is part of the port because the route has to turn a GitHub
    // account into a `userId` before it can read or write anything. It is
    // proven in `exports.test.ts`; here it only has to exist.
    user: {
      async upsert({ where, create }) {
        void where
        return { id: create.githubId }
      },
      async findUnique({ where }) {
        return { id: where.githubId }
      },
    },
    repo: {
      async upsert({ where, create, update }) {
        const found = findRepo(where.userId_owner_name)
        if (found) {
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
      async findUnique({ where }) {
        return findRepo(where.userId_owner_name)
      },
    },
    classification: {
      async findMany({ where }) {
        return classifications.filter((row) => row.repoId === where.repoId)
      },
      async upsert({ where, create, update }) {
        const key = where.repoId_pathOrGlob
        const found = classifications.find(
          (row) =>
            row.repoId === key.repoId && row.pathOrGlob === key.pathOrGlob
        )
        if (found) {
          found.kind = update.kind
          found.updatedAt = nextDate()
          return found
        }
        const row = {
          id: nextId("c"),
          ...create,
          createdAt: nextDate(),
          updatedAt: nextDate(),
        }
        classifications.push(row)
        return row
      },
    },
  }

  return { db, repos, classifications }
}

const repo = { owner: "octo", name: "hello" }
const key = { userId: "u1", owner: "octo", name: "hello" }

describe("saveOverride", () => {
  it("round-trips a file override, so it survives a reload", async () => {
    const { db } = createFakeDb()

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "dist/app.js", scope: "file", vendored: false },
    })

    expect(await listOverrides(db, key)).toEqual([
      { path: "dist/app.js", scope: "file", vendored: false },
    ])
  })

  /**
   * The trailing slash is the entire encoding of `scope`, so a folder rule
   * that came back as a file rule would silently stop cascading to
   * descendants — the failure SPEC's "folder rule reaches files listed later"
   * requirement is about.
   */
  it("round-trips a folder override with its cascade intact", async () => {
    const { db } = createFakeDb()

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "components/ui", scope: "folder", vendored: true },
    })

    const stored = await listOverrides(db, key)
    expect(stored).toEqual([
      { path: "components/ui", scope: "folder", vendored: true },
    ])

    const resolve = createVendoredResolver({ overrides: stored })
    expect(resolve("components/ui/button.tsx")?.vendored).toBe(true)
    // A file listed only after the rule was written is still covered.
    expect(resolve("components/ui/added-later.tsx")?.vendored).toBe(true)
  })

  it("updates the existing rule rather than stacking a contradictory one", async () => {
    const { db, classifications } = createFakeDb()

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "src/a.ts", scope: "file", vendored: true },
    })
    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "src/a.ts", scope: "file", vendored: false },
    })

    expect(classifications).toHaveLength(1)
    expect(await listOverrides(db, key)).toEqual([
      { path: "src/a.ts", scope: "file", vendored: false },
    ])
  })

  it("reuses the repo row instead of creating one per override", async () => {
    const { db, repos } = createFakeDb()

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "a.ts", scope: "file", vendored: true },
    })
    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "b.ts", scope: "file", vendored: true },
    })

    expect(repos).toHaveLength(1)
  })

  /**
   * The NDA assertion, the same one `exports.test.ts` makes about `UsedFile`:
   * a classification is a path and a verdict. Nothing else may ride along —
   * and note what is *deliberately* absent, because it is load-bearing:
   * there is no `contentHash` and no `sizeBytes`, which is exactly why an
   * override cannot be invalidated by the file's content changing.
   */
  it("persists a path and a verdict — nothing content-shaped", async () => {
    const { db, classifications } = createFakeDb()

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path: "src/a.ts", scope: "file", vendored: true },
    })

    expect(Object.keys(classifications[0]).sort()).toEqual([
      "createdAt",
      "id",
      "kind",
      "pathOrGlob",
      "repoId",
      "updatedAt",
    ])
  })
})

describe("listOverrides", () => {
  /**
   * The acceptance criterion, end to end against the fake: a file the parser
   * calls vendored is un-marked by the user, and the stored override still
   * beats the structural layer when the resolver is rebuilt from scratch —
   * which is what a page reload is.
   */
  it("still beats automatic detection after a reload", async () => {
    const { db } = createFakeDb()
    const path = "dist/bundle.js"

    // Before: the structural layer claims it.
    expect(createVendoredResolver({})(path)).toMatchObject({
      vendored: true,
      source: "structural",
    })

    await saveOverride(db, {
      userId: "u1",
      repo,
      override: { path, scope: "file", vendored: false },
    })

    const resolve = createVendoredResolver({
      overrides: await listOverrides(db, key),
    })
    expect(resolve(path)).toMatchObject({ vendored: false, source: "manual" })
  })

  it("returns nothing for a repo that has never been overridden", async () => {
    const { db } = createFakeDb()
    // No repo row exists yet — an empty list, not a crash.
    expect(await listOverrides(db, key)).toEqual([])
  })

  it("never returns another user's overrides for the same repository", async () => {
    const { db } = createFakeDb()

    await saveOverride(db, {
      userId: "u2",
      repo,
      override: { path: "src/a.ts", scope: "file", vendored: true },
    })

    expect(await listOverrides(db, key)).toEqual([])
  })
})
