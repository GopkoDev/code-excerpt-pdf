/**
 * The repository listing, cached across cold starts — behind one narrow port.
 *
 * Pure optimisation. `lib/sources/github.ts` already holds one Trees call per
 * repository for as long as the tab lives; this only covers the case that
 * cache cannot — a new tab, a new device, a serverless instance that just
 * started — where the first paint would otherwise wait on GitHub. **No
 * acceptance criterion depends on it.** Deleting every row costs one Trees
 * call per repository and changes nothing else.
 *
 * ### The NDA surface, stated plainly
 *
 * `TreeCache.tree` is the only Json column in the schema, so it is the one
 * place "no source code is ever stored" could be broken by something merely
 * passing through. `CachedFile` below names the three fields that are kept —
 * path, size, blob SHA — and Zod strips the rest, on the way in *and* on the
 * way out. A blob SHA is a pointer: reading what it points at still costs a
 * GitHub call with the user's own token, so caching the listing is emphatically
 * not caching the repository.
 *
 * One consequence worth stating rather than discovering: writing a cache row
 * creates the `Repo` row, so the database now learns which repositories were
 * *opened*, not only which were exported from. That is new information, and it
 * is the price of `TreeCache.repoId` being a foreign key, as SPEC §3 specifies.
 */

import { z } from "zod"

import type { ExportsDb, RepoRef, UsersDb } from "./exports"
import type { ParsedTree } from "../github/tree"

/**
 * How long a listing may be served without re-checking the head SHA.
 *
 * `{repoId}@{headSha}` is the real cache key, but a hit is served *without*
 * asking GitHub what the head is now — that is the entire saving — so nothing
 * else bounds how stale the answer can be after someone pushes. Fifteen
 * minutes: long enough to cover a page reload and a second tab, short enough
 * that a stale tree is a curiosity rather than a wrong export. The Refresh
 * control exists for the impatient case.
 */
export const TREE_CACHE_TTL_MS = 15 * 60 * 1000

/**
 * Exactly what may be stored per file. Anything else is stripped.
 *
 * `type` from SPEC §3 is absent on purpose: `parseTreeResponse` has already
 * dropped everything that is not a fetchable blob, so every row here is one.
 * Storing a constant would only be one more field to keep honest.
 */
const CachedFile = z.object({
  path: z.string(),
  sizeBytes: z.number(),
  blobSha: z.string(),
})

/**
 * Exported because the GDPR export reads this column too, and a subject-access
 * request must not become the one path that hands the raw Json back out. See
 * `lib/db/account.ts`.
 */
export const CachedTree = z.object({
  truncated: z.boolean(),
  files: z.array(CachedFile),
})

export type CachedTree = z.infer<typeof CachedTree>

export type TreeCacheDb = UsersDb & {
  repo: ExportsDb["repo"] & {
    findUnique(args: {
      where: {
        userId_owner_name: { userId: string; owner: string; name: string }
      }
    }): Promise<{ id: string } | null>
  }
  treeCache: {
    findUnique(args: {
      where: { repoId: string }
    }): Promise<{ headSha: string; tree: unknown; fetchedAt: Date } | null>
    upsert(args: {
      where: { repoId: string }
      create: {
        repoId: string
        headSha: string
        tree: CachedTree
        fetchedAt: Date
      }
      update: { headSha: string; tree: CachedTree; fetchedAt: Date }
    }): Promise<{ id: string }>
  }
}

/**
 * The cached listing for one repository of one user, or `null` for a miss.
 *
 * Every failure is a miss, never a throw: a repository nobody has opened, a
 * row past its TTL, a row written by an older shape of this code. The cost of
 * a miss is one Trees call, and an optimisation that can take the page down is
 * a bug rather than an optimisation.
 */
export async function readCachedTree(
  db: TreeCacheDb,
  { userId, owner, name }: { userId: string; owner: string; name: string },
  { ttlMs = TREE_CACHE_TTL_MS, now = new Date() }: CacheClock = {}
): Promise<ParsedTree | null> {
  const repo = await db.repo.findUnique({
    where: { userId_owner_name: { userId, owner, name } },
  })
  if (!repo) return null

  const row = await db.treeCache.findUnique({ where: { repoId: repo.id } })
  if (!row) return null

  if (now.getTime() - row.fetchedAt.getTime() > ttlMs) return null

  const parsed = CachedTree.safeParse(row.tree)
  if (!parsed.success) return null

  return { headSha: row.headSha, ...parsed.data }
}

export type CacheClock = { ttlMs?: number; now?: Date }

/**
 * Records the listing just fetched from GitHub, replacing whatever was there.
 *
 * One row per repository, keyed on `repoId`: the cache is a current answer,
 * not a history, so a moved head overwrites rather than accumulates.
 */
export async function writeCachedTree(
  db: TreeCacheDb,
  {
    userId,
    repo,
    tree,
    now = new Date(),
  }: {
    userId: string
    repo: RepoRef
    tree: ParsedTree
    now?: Date
  }
): Promise<void> {
  // Parsed rather than spread, so the column can only ever receive the three
  // fields named above — even if `ParsedTree` grows a fourth upstream.
  const stored = CachedTree.parse(tree)

  const repoRow = await db.repo.upsert({
    where: {
      userId_owner_name: { userId, owner: repo.owner, name: repo.name },
    },
    create: { userId, ...repo },
    update: { defaultBranch: repo.defaultBranch },
  })

  await db.treeCache.upsert({
    where: { repoId: repoRow.id },
    create: {
      repoId: repoRow.id,
      headSha: tree.headSha,
      tree: stored,
      fetchedAt: now,
    },
    update: { headSha: tree.headSha, tree: stored, fetchedAt: now },
  })
}
