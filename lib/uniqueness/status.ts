/**
 * Resolving what a repository's files are, given what has already been
 * exported.
 *
 * This is the rule the whole product exists for: no fragment appears in two
 * listings. It is deliberately *per file*, never per line — SPEC forbids
 * fragment-level deduplication, because a listing that silently omits parts of
 * a file is worse than one that repeats none of it.
 */

import type { FileEntry } from "../tree/types"

export type UsedFileRecord = {
  path: string
  contentHash: string
  commitSha: string
  sizeBytes: number
}

/**
 * Applies the export ledger to a fresh listing.
 *
 * @param entries      files as the source listed them
 * @param usedFiles    everything previously exported for this repo
 * @param currentHashes content hashes where the content has been fetched;
 *                      absent entries simply mean "not fetched yet"
 */
export function resolveStatuses(
  entries: FileEntry[],
  usedFiles: UsedFileRecord[],
  currentHashes: ReadonlyMap<string, string> = new Map()
): FileEntry[] {
  // Later records win: a path exported twice is judged against the most
  // recent export, not the first.
  const ledger = new Map<string, UsedFileRecord>()
  for (const record of usedFiles) ledger.set(record.path, record)

  return entries.map((entry) => {
    // A vendored or unreadable file has already been decided on other grounds;
    // the ledger has nothing to add.
    if (entry.status !== "available") return entry

    const record = ledger.get(entry.path)
    if (!record) return entry

    const currentHash = currentHashes.get(entry.path)

    // No hash means the content has not been fetched. Assume unchanged: a used
    // file must never *silently* re-enter a listing. Selecting it deliberately
    // is still allowed — the UI warns rather than blocking.
    if (currentHash === undefined) return { ...entry, status: "used" }

    return {
      ...entry,
      status: currentHash === record.contentHash ? "used" : "used-but-changed",
    }
  })
}
