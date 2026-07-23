/**
 * The precedence resolver.
 *
 *   manual  >  .gitattributes  >  ecosystem plugin  >  structural list
 *
 * Each layer either answers or abstains; the first answer wins. Returning
 * `null` means "nothing has an opinion", which the UI reads as authored.
 *
 * Every layer is evaluated **per query**, never precomputed per file. That is
 * what makes a folder rule cover files that appear later — SPEC requires the
 * cascade to reach them, and a snapshot taken when the rule was created would
 * silently miss them.
 */

import { gitattributesLayer } from "./gitattributes"
import { matchesGlob } from "./glob"
import { shadcnLayer } from "./plugins/shadcn"
import { structuralLayer } from "./structural"
import type { Layer, ManualOverride, Verdict } from "./types"

export type { ManualOverride, Verdict, VendoredSource } from "./types"

/**
 * Manual overrides, most specific first: a file rule beats the folder it sits
 * in, and a deeper folder rule beats a shallower one. Ties are impossible —
 * two rules cannot share a path and a scope.
 */
function manualLayer(overrides: ManualOverride[]): Layer {
  const ranked = [...overrides].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "file" ? -1 : 1
    return b.path.split("/").length - a.path.split("/").length
  })

  return (path) => {
    const hit = ranked.find((override) =>
      override.scope === "file"
        ? matchesGlob(path, override.path) &&
          path.replace(/^\.?\//, "") === override.path
        : matchesGlob(path, override.path)
    )
    if (!hit) return null
    return {
      vendored: hit.vendored,
      source: "manual",
      reason: hit.vendored
        ? `Marked vendored by you (${hit.scope})`
        : `Marked authored by you (${hit.scope})`,
    }
  }
}

export function createVendoredResolver(input: {
  gitattributes?: string
  componentsJson?: string
  overrides?: ManualOverride[]
}): (path: string) => Verdict | null {
  const layers: Layer[] = [
    manualLayer(input.overrides ?? []),
    gitattributesLayer(input.gitattributes),
    shadcnLayer(input.componentsJson),
    structuralLayer(),
  ]

  return (path) => {
    for (const layer of layers) {
      const verdict = layer(path)
      if (verdict) return verdict
    }
    return null
  }
}
