import { getPrisma } from "./client"
import type { TreeCacheDb } from "./tree-cache"

/**
 * The real `TreeCacheDb` — Prisma, narrowed to the port.
 *
 * Same shape and same reasoning as `exports-db.ts`: writing the calls out is
 * what type-checks the port against the generated client, so if `TreeCache`
 * and `lib/db/tree-cache.ts` ever drift, this file stops compiling.
 *
 * The client is resolved per call, so importing this opens no connection.
 */
export const treeCacheDb: TreeCacheDb = {
  user: {
    upsert: (args) => getPrisma().user.upsert(args),
    findUnique: (args) => getPrisma().user.findUnique(args),
  },
  repo: {
    upsert: (args) => getPrisma().repo.upsert(args),
    findUnique: (args) => getPrisma().repo.findUnique(args),
  },
  treeCache: {
    findUnique: (args) => getPrisma().treeCache.findUnique(args),
    upsert: (args) => getPrisma().treeCache.upsert(args),
  },
}
