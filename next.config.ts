import type { NextConfig } from "next"

/**
 * Still empty, and both absences are load-bearing.
 *
 * **pdfkit** is not here because it is never imported: it is vendored into
 * `public/vendor/` and loaded by a Web Worker with `importScripts`. Turbopack
 * is the default bundler in Next 16 and supports no webpack plugins, so
 * pdfkit's official recipe would have been unusable anyway.
 *
 * **Prisma** is not here either — the open question in `docs/tasks/todo.md`
 * § slice 6. With the client generated into `lib/db/generated` (a path inside
 * the project rather than under `node_modules`), neither
 * `serverExternalPackages` nor a Turbopack alias turned out to be needed:
 * `npm run build` compiles and collects `/api/exports` with this file empty.
 * The client is also constructed lazily (`lib/db/client.ts`), so collecting
 * page data never opens a connection.
 */
const nextConfig: NextConfig = {}

export default nextConfig
