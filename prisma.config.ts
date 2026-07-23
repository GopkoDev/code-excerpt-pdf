import { loadEnvFile } from "node:process"

import { defineConfig } from "prisma/config"

/**
 * Prisma 7 stopped auto-loading `.env` once a config file exists — verified,
 * not assumed: with DIRECT_URL set in `.env`, `prisma migrate status` still
 * reported "datasource.url is required".
 *
 * `.env` first, then `.env.local`, so local overrides shared defaults — the
 * same precedence Next.js uses. Both are optional: on Vercel the variables
 * come from the environment and neither file exists.
 */
for (const file of [".env", ".env.local"]) {
  try {
    loadEnvFile(file)
  } catch {
    // Not present — fine.
  }
}

/**
 * Prisma 7 moves the datasource URL out of schema.prisma and into here.
 *
 * The two connection strings are NOT interchangeable:
 *   DATABASE_URL  pooled   — runtime queries
 *   DIRECT_URL    unpooled — migrations, because the pooler cannot hold the
 *                            advisory locks migrations take out
 * Pointing migrations at the pooled string fails in a way that looks like a
 * hung command rather than a configuration error.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Deliberately the UNPOOLED string. This config is read only by the
    // migration and introspection commands — runtime goes through the Neon
    // adapter in lib/db/client.ts with DATABASE_URL.
    url: process.env.DIRECT_URL,
  },
})
