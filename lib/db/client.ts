import { PrismaNeon } from "@prisma/adapter-neon"

import { PrismaClient } from "./generated/client"

/**
 * The Prisma client, one instance per lambda.
 *
 * Prisma 7 is ESM-only and **requires a driver adapter** — there is no plain
 * pooled-connection-string path any more. `PrismaNeon` speaks Neon's HTTP
 * protocol, which is what makes it usable from a serverless function at all.
 *
 * The `globalThis` cache is not a micro-optimisation: without it, dev-server
 * hot reloads open a new pool on every edit until the database refuses
 * connections.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createClient(): PrismaClient {
  // DATABASE_URL is the POOLED string. Migrations use DIRECT_URL instead —
  // see prisma.config.ts.
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
