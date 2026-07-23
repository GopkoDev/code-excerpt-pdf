/**
 * `ContentSource` over files the user dropped or picked locally.
 *
 * Reads are lazy on purpose. A dropped monorepo can be thousands of files, and
 * only the selected ones are ever needed — the same discipline the GitHub
 * source will require in slice 5, where eager reads would blow the API budget.
 * Keeping both sources honest about that is the point of the interface.
 */

import type { ContentSource, FileEntry } from "../tree/types"

export type LocalFile = {
  /** Path relative to the dropped root, e.g. `project/src/a.ts`. */
  path: string
  blob: Blob
}

/**
 * `webkitRelativePath` is what carries folder structure through a directory
 * picker; it is empty for individually chosen files, where the bare name is
 * the whole path.
 */
export function toLocalFiles(files: File[]): LocalFile[] {
  return files.map((file) => ({
    path: file.webkitRelativePath || file.name,
    blob: file,
  }))
}

export function createLocalSource(files: LocalFile[]): ContentSource {
  const byPath = new Map(files.map((file) => [file.path, file]))

  return {
    async listFiles(): Promise<FileEntry[]> {
      return files.map((file) => ({
        path: file.path,
        name: file.path.split("/").pop() ?? file.path,
        sizeBytes: file.blob.size,
        status: "available",
      }))
    },

    async readFile(path: string): Promise<Uint8Array> {
      const file = byPath.get(path)
      if (!file) throw new Error(`No such file in this selection: ${path}`)
      return new Uint8Array(await file.blob.arrayBuffer())
    },
  }
}
