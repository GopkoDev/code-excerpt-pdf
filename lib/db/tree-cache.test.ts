import { describe, expect, it } from "vitest"

import {
  readCachedTree,
  writeCachedTree,
  TREE_CACHE_TTL_MS,
  type TreeCacheDb,
} from "@/lib/db/tree-cache"

/**
 * The same in-memory stand-in the other ports use. No database exists, and
 * this one has more than the usual reason to be tested without one: `tree` is
 * the only Json column in the schema, which makes it the one place where "no
 * source code is ever stored" could be broken by something merely passing
 * through rather than by a field somebody added on purpose.
 */
function createFakeDb() {
  type RepoRow = {
    id: string
    userId: string
    owner: string
    name: string
    defaultBranch: string | null
  }
  type CacheRow = {
    id: string
    repoId: string
    headSha: string
    tree: unknown
    fetchedAt: Date
  }

  const repos: RepoRow[] = []
  const caches: CacheRow[] = []

  let sequence = 0
  const nextId = (prefix: string) => `${prefix}${++sequence}`

  const findRepo = (key: { userId: string; owner: string; name: string }) =>
    repos.find(
      (row) =>
        row.userId === key.userId &&
        row.owner === key.owner &&
        row.name === key.name
    ) ?? null

  const db: TreeCacheDb = {
    // Identity is part of the port because the route has to turn a GitHub
    // account into a `userId`. Proven in `exports.test.ts`; here it only has
    // to exist.
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
    treeCache: {
      async findUnique({ where }) {
        return caches.find((row) => row.repoId === where.repoId) ?? null
      },
      async upsert({ where, create, update }) {
        const found = caches.find((row) => row.repoId === where.repoId)
        if (found) {
          Object.assign(found, update)
          return found
        }
        const row = { id: nextId("t"), ...create }
        caches.push(row)
        return row
      },
    },
  }

  return { db, repos, caches }
}

const repo = { owner: "octo", name: "hello" }
const key = { userId: "u1", owner: "octo", name: "hello" }

const tree = {
  headSha: "head1",
  truncated: false,
  files: [
    { path: "src/a.ts", sizeBytes: 120, blobSha: "blob-a" },
    { path: "README.md", sizeBytes: 40, blobSha: "blob-r" },
  ],
}

describe("writeCachedTree", () => {
  it("round-trips a listing, so a cold start can paint from it", async () => {
    const { db } = createFakeDb()

    await writeCachedTree(db, { userId: "u1", repo, tree })

    expect(await readCachedTree(db, key)).toEqual(tree)
  })

  /**
   * The NDA assertion, and the one that matters most in this table: a blob SHA
   * is a *pointer*. Reading what it points at still costs a GitHub call with
   * the user's own token, which is why caching the listing is not caching the
   * repository.
   */
  it("stores path, size and blob sha — and drops anything else", async () => {
    const { db, caches } = createFakeDb()

    await writeCachedTree(db, {
      userId: "u1",
      repo,
      tree: {
        ...tree,
        files: [
          {
            ...tree.files[0],
            // A field that should never have got this far. If the upstream
            // parser ever grew one, it must not reach the column.
            content: "export const secret = 1",
          } as (typeof tree.files)[number],
        ],
      },
    })

    const stored = caches[0].tree as { files: Record<string, unknown>[] }
    expect(Object.keys(stored.files[0]).sort()).toEqual([
      "blobSha",
      "path",
      "sizeBytes",
    ])
    expect(JSON.stringify(caches[0])).not.toContain("secret")
  })

  /**
   * `{repoId}@{headSha}` is the cache key, so a new head replaces the row
   * rather than adding one. A table that accumulated every revision ever
   * listed would be a growing NDA surface for no benefit.
   */
  it("replaces the row when the head moves, never accumulates", async () => {
    const { db, caches } = createFakeDb()

    await writeCachedTree(db, { userId: "u1", repo, tree })
    await writeCachedTree(db, {
      userId: "u1",
      repo,
      tree: { ...tree, headSha: "head2" },
    })

    expect(caches).toHaveLength(1)
    expect((await readCachedTree(db, key))?.headSha).toBe("head2")
  })
})

describe("readCachedTree", () => {
  it("misses when the repository has never been listed", async () => {
    const { db } = createFakeDb()
    expect(await readCachedTree(db, key)).toBeNull()
  })

  /**
   * The backstop. A hit is served *without* asking GitHub for the current head
   * SHA — that is the entire saving — so nothing else bounds how stale the
   * answer can be when the head moved and nothing told us.
   */
  it("misses once the row is older than the TTL", async () => {
    const { db } = createFakeDb()
    const written = new Date("2026-07-23T12:00:00Z")

    await writeCachedTree(db, { userId: "u1", repo, tree, now: written })

    const justInside = new Date(written.getTime() + TREE_CACHE_TTL_MS - 1000)
    expect(await readCachedTree(db, key, { now: justInside })).toEqual(tree)

    const justOutside = new Date(written.getTime() + TREE_CACHE_TTL_MS + 1000)
    expect(await readCachedTree(db, key, { now: justOutside })).toBeNull()
  })

  it("never serves one user's listing to another", async () => {
    const { db } = createFakeDb()

    await writeCachedTree(db, { userId: "u2", repo, tree })

    expect(await readCachedTree(db, key)).toBeNull()
  })

  /**
   * A row written by an older shape of this code, or hand-edited, must read as
   * a miss — one extra Trees call — rather than crash the page. The cache is an
   * optimisation, and an optimisation that can take the app down is a bug.
   */
  it("treats an unreadable row as a miss rather than an error", async () => {
    const { db, caches } = createFakeDb()

    await writeCachedTree(db, { userId: "u1", repo, tree })
    caches[0].tree = { files: [{ path: 42 }] }

    expect(await readCachedTree(db, key)).toBeNull()
  })
})
