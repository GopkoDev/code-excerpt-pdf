import { defineConfig } from "prisma/config"

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
