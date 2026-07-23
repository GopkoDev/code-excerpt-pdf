/**
 * The lowest-precedence layer: paths that are vendored or generated in
 * essentially every ecosystem, regardless of what the repo says.
 *
 * Kept deliberately conservative. A false positive here hides a file the user
 * actually wrote, and although the UI never hard-blocks, a hidden file is one
 * they have to go looking for. Anything arguable belongs in `.gitattributes`,
 * where the repo owner has said it explicitly.
 */

import { matchesGlob } from "./glob"
import type { Layer } from "./types"

export const STRUCTURAL_PATTERNS: { pattern: string; reason: string }[] = [
  { pattern: "node_modules", reason: "Installed dependency (node_modules)" },
  { pattern: "vendor", reason: "Vendored third-party code (vendor)" },
  { pattern: "dist", reason: "Build output (dist)" },
  { pattern: "build", reason: "Build output (build)" },
  { pattern: "out", reason: "Build output (out)" },
  { pattern: ".next", reason: "Next.js build output (.next)" },
  { pattern: ".turbo", reason: "Turbo cache (.turbo)" },
  { pattern: "coverage", reason: "Coverage report (coverage)" },
  { pattern: "__generated__", reason: "Generated code (__generated__)" },
  { pattern: "*.min.js", reason: "Minified bundle" },
  { pattern: "*.min.css", reason: "Minified stylesheet" },
  { pattern: "package-lock.json", reason: "Lockfile (package-lock.json)" },
  { pattern: "yarn.lock", reason: "Lockfile (yarn.lock)" },
  { pattern: "pnpm-lock.yaml", reason: "Lockfile (pnpm-lock.yaml)" },
  { pattern: "bun.lockb", reason: "Lockfile (bun.lockb)" },
  { pattern: "Cargo.lock", reason: "Lockfile (Cargo.lock)" },
  { pattern: "poetry.lock", reason: "Lockfile (poetry.lock)" },
  { pattern: "composer.lock", reason: "Lockfile (composer.lock)" },
]

export function structuralLayer(): Layer {
  return (path) => {
    const hit = STRUCTURAL_PATTERNS.find((rule) =>
      matchesGlob(path, rule.pattern)
    )
    if (!hit) return null
    return { vendored: true, source: "structural", reason: hit.reason }
  }
}
