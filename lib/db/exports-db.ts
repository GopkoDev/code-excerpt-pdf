import { getPrisma } from "./client"
import type { ExportsDb } from "./exports"

/**
 * The real `ExportsDb` — Prisma, narrowed to the port.
 *
 * An adapter rather than `const db: ExportsDb = prisma`, because Prisma's
 * methods are generic (`SelectSubset<T, …>`) and a generic signature is not
 * assignable to a concrete one, however compatible the call sites are. Writing
 * the calls out is what actually type-checks the argument shapes in
 * `lib/db/exports.ts` against the generated client: if the schema and the port
 * disagree, this file stops compiling.
 *
 * The client is resolved per call, so importing this module never opens a
 * connection — see `getPrisma`.
 */
export const exportsDb: ExportsDb = {
  user: {
    upsert: (args) => getPrisma().user.upsert(args),
    findUnique: (args) => getPrisma().user.findUnique(args),
  },
  repo: {
    upsert: (args) => getPrisma().repo.upsert(args),
  },
  export: {
    create: (args) => getPrisma().export.create(args),
    findMany: (args) => getPrisma().export.findMany(args),
  },
  usedFile: {
    findMany: (args) => getPrisma().usedFile.findMany(args),
  },
}
