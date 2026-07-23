import { getPrisma } from "./client"
import type { ClassificationsDb } from "./classifications"

/**
 * The real `ClassificationsDb` — Prisma, narrowed to the port.
 *
 * Same shape and same reasoning as `exports-db.ts`: an adapter rather than a
 * cast, because Prisma's methods are generic and a generic signature is not
 * assignable to a concrete one. Writing the calls out is what type-checks the
 * port against the generated client, so if `Classification` and
 * `lib/db/classifications.ts` ever drift, this file stops compiling.
 *
 * The client is resolved per call, so importing this opens no connection.
 */
export const classificationsDb: ClassificationsDb = {
  user: {
    upsert: (args) => getPrisma().user.upsert(args),
    findUnique: (args) => getPrisma().user.findUnique(args),
  },
  repo: {
    upsert: (args) => getPrisma().repo.upsert(args),
    findUnique: (args) => getPrisma().repo.findUnique(args),
  },
  classification: {
    findMany: (args) => getPrisma().classification.findMany(args),
    upsert: (args) => getPrisma().classification.upsert(args),
  },
}
