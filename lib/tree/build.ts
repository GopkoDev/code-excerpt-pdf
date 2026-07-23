/**
 * Turning a flat list of paths into a nested tree.
 *
 * Both sources produce a flat list — `webkitdirectory` gives
 * `webkitRelativePath`, GitHub's `recursive=1` Trees call gives full paths —
 * so this is shared, and must stay independent of either.
 */

import type { FileEntry, FileNode, FolderNode, TreeNode } from "./types"

/** `./src//a.ts` → `src/a.ts`. Sources are not consistent about either. */
function normalizePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/")
}

/**
 * Folders before files, each alphabetical by UTF-16 code unit — the same
 * ordering the renderer uses, and deliberately not `localeCompare`, which
 * varies with the ambient locale.
 */
function inDisplayOrder(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}

type FolderDraft = {
  name: string
  path: string
  folders: Map<string, FolderDraft>
  files: FileNode[]
}

function draft(name: string, path: string): FolderDraft {
  return { name, path, folders: new Map(), files: [] }
}

function finalize(node: FolderDraft): FolderNode {
  const children = [...[...node.folders.values()].map(finalize), ...node.files]

  const totals = children.reduce(
    (acc, child) => {
      if (child.kind === "file") {
        acc.sizeBytes += child.entry.sizeBytes
        acc.fileCount += 1
        if (child.entry.status === "available") acc.availableCount += 1
      } else {
        acc.sizeBytes += child.sizeBytes
        acc.fileCount += child.fileCount
        acc.availableCount += child.availableCount
      }
      return acc
    },
    { sizeBytes: 0, fileCount: 0, availableCount: 0 }
  )

  return {
    kind: "folder",
    name: node.name,
    path: node.path,
    children: inDisplayOrder(children),
    ...totals,
  }
}

export function buildTree(entries: FileEntry[]): TreeNode[] {
  const root = draft("", "")

  for (const entry of entries) {
    const path = normalizePath(entry.path)
    if (path === "") continue

    const segments = path.split("/")
    const filename = segments.pop()!

    let folder = root
    let prefix = ""
    for (const segment of segments) {
      prefix = prefix === "" ? segment : `${prefix}/${segment}`
      const existing = folder.folders.get(segment)
      if (existing) {
        folder = existing
      } else {
        const created = draft(segment, prefix)
        folder.folders.set(segment, created)
        folder = created
      }
    }

    folder.files.push({
      kind: "file",
      path,
      name: filename,
      entry: { ...entry, path, name: filename },
    })
  }

  return finalize(root).children
}

/** Every file in the tree, depth first — folders before files at each level. */
export function flattenFiles(nodes: TreeNode[]): FileNode[] {
  return nodes.flatMap((node) =>
    node.kind === "file" ? [node] : flattenFiles(node.children)
  )
}

/**
 * The deepest folder every path shares.
 *
 * A directory picker prefixes every path with the dropped folder's own name,
 * so repo-level config — `components.json`, `.gitattributes` — sits under it
 * rather than at the root. Vendored detection has to evaluate paths relative
 * to the repo, not to whatever the folder happened to be called.
 *
 * The last segment is never consumed: it is the filename, not a folder.
 */
export function commonRoot(paths: string[]): string {
  if (paths.length === 0) return ""

  const folders = paths.map((path) =>
    path
      .split("/")
      .filter((s) => s !== "" && s !== ".")
      .slice(0, -1)
  )

  const shortest = Math.min(...folders.map((f) => f.length))
  const shared: string[] = []
  for (let depth = 0; depth < shortest; depth++) {
    const segment = folders[0][depth]
    if (folders.every((f) => f[depth] === segment)) shared.push(segment)
    else break
  }

  return shared.join("/")
}

export function folderAt(
  nodes: TreeNode[],
  path: string
): FolderNode | undefined {
  for (const node of nodes) {
    if (node.kind !== "folder") continue
    if (node.path === path) return node
    const found = folderAt(node.children, path)
    if (found) return found
  }
  return undefined
}
