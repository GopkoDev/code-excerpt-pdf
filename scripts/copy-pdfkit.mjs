// Copies pdfkit's standalone browser build into public/vendor/ so a Web Worker
// can load it with importScripts() at runtime.
//
// Why a copy instead of an import: the standalone bundle inlines every Node
// shim and font table (~2.4 MB, zero deps). Keeping it out of the module graph
// keeps it out of Next's bundle and off the main thread, and lets next.config.ts
// stay empty — Next 16 uses Turbopack for `build`, so pdfkit's official webpack
// recipe is not available to us.
//
// Runs on postinstall so the vendored copy is always the version npm resolved.

import { copyFile, mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "node_modules/pdfkit/js/pdfkit.standalone.js")
const destDir = join(root, "public/vendor")
const dest = join(destDir, "pdfkit.standalone.js")

const { version } = JSON.parse(
  await readFile(join(root, "node_modules/pdfkit/package.json"), "utf8")
)

await mkdir(destDir, { recursive: true })
await copyFile(source, dest)

console.log(`copied pdfkit ${version} standalone build → public/vendor/`)
