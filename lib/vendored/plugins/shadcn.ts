/**
 * Ecosystem plugin: shadcn/ui.
 *
 * shadcn components are copied into the repo as source, so they look authored
 * to every heuristic — they sit in `components/`, they are ordinary `.tsx`,
 * nothing marks them. But `components.json` names the folder they land in, so
 * the project states it itself.
 *
 * This is the pattern for future plugins: read the ecosystem's own config
 * rather than guessing from paths.
 */

import { matchesGlob } from "../glob"
import type { Layer } from "../types"

/**
 * Resolves `aliases.ui` from components.json to a repo-relative folder.
 * `@/components/ui` → `components/ui`, since `@/` maps to the repo root here.
 */
export function shadcnUiFolder(
  componentsJson: string | undefined
): string | null {
  if (!componentsJson) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(componentsJson)
  } catch {
    // A malformed config is not worth failing the whole tree over.
    return null
  }

  const alias = (parsed as { aliases?: { ui?: unknown } })?.aliases?.ui
  if (typeof alias !== "string" || alias === "") return null

  return alias.replace(/^@\//, "").replace(/^\.?\//, "")
}

export function shadcnLayer(componentsJson: string | undefined): Layer {
  const folder = shadcnUiFolder(componentsJson)
  if (!folder) return () => null

  return (path) =>
    matchesGlob(path, folder)
      ? {
          vendored: true,
          source: "plugin",
          reason: `shadcn component (components.json → aliases.ui = ${folder})`,
        }
      : null
}
