/**
 * `.gitattributes` is the repo owner's own statement about what is vendored,
 * so it outranks every automatic guess — and it is the only automatic layer
 * that can mark something as *authored* (`-linguist-vendored`), rescuing files
 * the structural list or a plugin would otherwise hide.
 */

import { matchesGlob } from "./glob"
import type { Layer } from "./types"

export type GitattributesRule = { pattern: string; vendored: boolean }

/** Attributes GitHub itself uses to exclude files from language stats. */
const VENDORED_ATTRIBUTES = ["linguist-vendored", "linguist-generated"]

export function parseGitattributes(content: string): GitattributesRule[] {
  const rules: GitattributesRule[] = []

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (line === "" || line.startsWith("#")) continue

    const [pattern, ...attributes] = line.split(/\s+/)
    if (!pattern || attributes.length === 0) continue

    for (const attribute of attributes) {
      const negated = attribute.startsWith("-")
      const name = negated ? attribute.slice(1) : attribute
      if (!VENDORED_ATTRIBUTES.includes(name)) continue
      rules.push({ pattern, vendored: !negated })
      break
    }
  }

  return rules
}

export function gitattributesLayer(content: string | undefined): Layer {
  const rules = content ? parseGitattributes(content) : []
  return (path) => {
    // Last matching rule wins, as git itself resolves attributes.
    const hit = [...rules]
      .reverse()
      .find((rule) => matchesGlob(path, rule.pattern))
    if (!hit) return null
    return {
      vendored: hit.vendored,
      source: "gitattributes",
      reason: `.gitattributes: ${hit.pattern} ${hit.vendored ? "" : "-"}linguist-vendored`,
    }
  }
}
