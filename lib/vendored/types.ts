/**
 * Vendored detection: deciding which files the user did not author.
 *
 * Four layers, in strict precedence order. Each either answers for a path or
 * abstains, and the first answer wins:
 *
 *   manual  →  .gitattributes  →  ecosystem plugin  →  structural list
 *
 * SPEC is emphatic that this never hard-blocks: a vendored file can always be
 * added, with a warning, and any automatic verdict can be overridden at file
 * or folder level.
 */

export type VendoredSource =
  "manual" | "gitattributes" | "plugin" | "structural"

export type Verdict = {
  vendored: boolean
  source: VendoredSource
  /** Human-readable justification, shown in the UI. */
  reason: string
}

/** Answers for a path, or abstains so the next layer can. */
export type Layer = (path: string) => Verdict | null

export type ManualOverride = {
  path: string
  /** A folder override cascades to every descendant, including future ones. */
  scope: "file" | "folder"
  vendored: boolean
}
