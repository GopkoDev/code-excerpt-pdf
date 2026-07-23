/**
 * How much of a project has already been filed.
 *
 * This is why `UsedFile` carries `sizeBytes` at all: the share of a repository
 * already consumed is arithmetic over the ledger plus the tree listing that is
 * already in hand, so it costs **no** extra GitHub call — not one blob, not a
 * second Trees call. A file exported and later deleted still counts as spent
 * volume, which is the other reason the size is recorded rather than looked up.
 */

import type { FileEntry } from "../tree/types"
import type { UsedFileRecord } from "./status"

export type ProjectStats = {
  /** Files the user could plausibly file — vendored ones are not theirs. */
  totalFiles: number
  totalBytes: number
  usedFiles: number
  usedBytes: number
  /** 0–1, clamped: a share can never exceed the whole. */
  share: number
}

export function projectStats(
  entries: FileEntry[],
  usedFiles: UsedFileRecord[]
): ProjectStats {
  // Vendored files are not the author's material. Leaving them in the
  // denominator would understate how much of the project is already spent.
  const authored = entries.filter((entry) => entry.status !== "vendored")
  const totalBytes = authored.reduce((sum, entry) => sum + entry.sizeBytes, 0)

  // A path exported twice is one file's worth of volume, not two.
  const byPath = new Map<string, UsedFileRecord>()
  for (const record of usedFiles) byPath.set(record.path, record)
  const usedBytes = [...byPath.values()].reduce(
    (sum, record) => sum + record.sizeBytes,
    0
  )

  return {
    totalFiles: authored.length,
    totalBytes,
    usedFiles: byPath.size,
    usedBytes,
    share: totalBytes === 0 ? 0 : Math.min(1, usedBytes / totalBytes),
  }
}
