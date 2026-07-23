/**
 * The seam between "where files come from" and everything that consumes them.
 *
 * Anonymous mode implements `ContentSource` over a dropped folder
 * (`lib/sources/local.ts`); slice 5 adds a GitHub implementation. Nothing
 * downstream — tree building, selection, estimation, rendering — may know
 * which one it is talking to.
 */

/** Why a file may not be selectable. `available` is the only usable state. */
export type FileStatus = "available" | "used" | "used-but-changed" | "vendored"

export type FileEntry = {
  /** Path relative to the source root, e.g. `src/lib/utils.ts`. Unique. */
  path: string
  /** Basename — what the PDF prints as the title. */
  name: string
  sizeBytes: number
  status: FileStatus
}

export type FileNode = {
  kind: "file"
  path: string
  name: string
  entry: FileEntry
}

export type FolderNode = {
  kind: "folder"
  path: string
  name: string
  children: TreeNode[]
  /** Aggregates over all descendants, not just direct children. */
  sizeBytes: number
  fileCount: number
  availableCount: number
}

export type TreeNode = FileNode | FolderNode

/**
 * A place files can be listed and read from. Content is fetched lazily and
 * only for files the user actually selected — that is what keeps the GitHub
 * implementation inside its API budget.
 */
export type ContentSource = {
  listFiles(): Promise<FileEntry[]>
  readFile(path: string): Promise<Uint8Array>
}
