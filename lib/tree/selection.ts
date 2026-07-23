/**
 * Selection state and bulk operations over the tree.
 *
 * Two rules from SPEC drive the asymmetry here:
 *  - bulk folder select adds only `available` files, and reports what it
 *    skipped, so a user is never surprised by what a folder click did
 *  - a single file is never hard-blocked. Picking a used file deliberately is
 *    allowed; the UI warns. Only *silent* re-entry is forbidden.
 */

import { flattenFiles } from "./build"
import type { FileNode, TreeNode } from "./types"

export type SelectionState = "none" | "partial" | "all"

export type SelectionChange = {
  selected: Set<string>
  added: number
  skippedUsed: number
  skippedVendored: number
}

function descendants(node: TreeNode): FileNode[] {
  return node.kind === "file" ? [node] : flattenFiles(node.children)
}

/**
 * Tri-state, computed over *selectable* files only: a folder whose remaining
 * files are all used or vendored still reads as fully selected, because the
 * user cannot add anything more. A folder with nothing available is always
 * `none` — there is no state its checkbox could meaningfully be in.
 */
export function nodeState(
  node: TreeNode,
  selected: ReadonlySet<string>
): SelectionState {
  const available = descendants(node).filter(
    (file) => file.entry.status === "available"
  )
  if (available.length === 0) return "none"

  const chosen = available.filter((file) => selected.has(file.path)).length
  if (chosen === 0) return "none"
  return chosen === available.length ? "all" : "partial"
}

export function selectFolder(
  node: TreeNode,
  selected: ReadonlySet<string>
): SelectionChange {
  const next = new Set(selected)
  let added = 0
  let skippedUsed = 0
  let skippedVendored = 0

  for (const file of descendants(node)) {
    const { status, path } = { status: file.entry.status, path: file.path }

    if (status === "vendored") {
      skippedVendored += 1
      continue
    }
    if (status === "used" || status === "used-but-changed") {
      skippedUsed += 1
      continue
    }
    if (!next.has(path)) {
      next.add(path)
      added += 1
    }
  }

  return { selected: next, added, skippedUsed, skippedVendored }
}

/** Clears every descendant, including ones bulk select would have skipped. */
export function deselectFolder(
  node: TreeNode,
  selected: ReadonlySet<string>
): Set<string> {
  const next = new Set(selected)
  for (const file of descendants(node)) next.delete(file.path)
  return next
}

export function toggleFile(
  path: string,
  selected: ReadonlySet<string>
): Set<string> {
  const next = new Set(selected)
  if (!next.delete(path)) next.add(path)
  return next
}
