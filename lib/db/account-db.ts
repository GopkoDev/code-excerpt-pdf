import { getPrisma } from "./client"
import type { AccountDb } from "./account"

/**
 * The real `AccountDb` — Prisma, narrowed to the port.
 *
 * Same shape and same reasoning as `exports-db.ts`: writing the calls out is
 * what type-checks the port against the generated client, so if a model gains
 * a column and `lib/db/account.ts` does not, this file stops compiling — which
 * is exactly the drift a GDPR export must never survive quietly.
 *
 * The client is resolved per call, so importing this opens no connection.
 */
export const accountDb: AccountDb = {
  user: {
    findUnique: (args) => getPrisma().user.findUnique(args),
    delete: (args) => getPrisma().user.delete(args),
  },
  repo: {
    findMany: (args) => getPrisma().repo.findMany(args),
    deleteMany: (args) => getPrisma().repo.deleteMany(args),
  },
  export: {
    findMany: (args) => getPrisma().export.findMany(args),
    deleteMany: (args) => getPrisma().export.deleteMany(args),
  },
  usedFile: {
    findMany: (args) => getPrisma().usedFile.findMany(args),
    deleteMany: (args) => getPrisma().usedFile.deleteMany(args),
  },
  classification: {
    findMany: (args) => getPrisma().classification.findMany(args),
    deleteMany: (args) => getPrisma().classification.deleteMany(args),
  },
  treeCache: {
    findMany: (args) => getPrisma().treeCache.findMany(args),
    deleteMany: (args) => getPrisma().treeCache.deleteMany(args),
  },
}
