import { describe, expect, it } from "vitest"

import { projectStats } from "@/lib/uniqueness/stats"
import type { UsedFileRecord } from "@/lib/uniqueness/status"
import type { FileEntry, FileStatus } from "@/lib/tree/types"

const listed = (
  path: string,
  sizeBytes: number,
  status: FileStatus = "available"
): FileEntry => ({
  path,
  name: path.split("/").pop()!,
  sizeBytes,
  status,
})

const used = (
  path: string,
  sizeBytes: number,
  contentHash = "h"
): UsedFileRecord => ({ path, contentHash, commitSha: "c", sizeBytes })

describe("projectStats", () => {
  it("is zero for a repository nothing has been exported from", () => {
    const stats = projectStats([listed("a.ts", 100)], [])
    expect(stats).toEqual({
      totalFiles: 1,
      totalBytes: 100,
      usedFiles: 0,
      usedBytes: 0,
      share: 0,
    })
  })

  /**
   * The whole point of carrying `sizeBytes` on `UsedFile`: the share of a
   * project already consumed is arithmetic over the ledger and the tree
   * listing that is already in hand. Nothing here may need a blob.
   */
  it("computes the share of volume from the ledger's own sizes", () => {
    const stats = projectStats(
      [listed("a.ts", 100), listed("b.ts", 300)],
      // Deliberately a different size from the listing: the ledger records
      // what was exported, and that is what was consumed.
      [used("a.ts", 100)]
    )
    expect(stats.usedFiles).toBe(1)
    expect(stats.usedBytes).toBe(100)
    expect(stats.share).toBeCloseTo(0.25)
  })

  it("counts a path exported twice once", () => {
    const stats = projectStats(
      [listed("a.ts", 100), listed("b.ts", 100)],
      [used("a.ts", 100, "old"), used("a.ts", 100, "new")]
    )
    expect(stats.usedFiles).toBe(1)
    expect(stats.usedBytes).toBe(100)
  })

  /**
   * Vendored files are not the author's material, so counting them in the
   * denominator would understate how much of the project is spent.
   */
  it("leaves vendored files out of the total", () => {
    const stats = projectStats(
      [listed("a.ts", 100), listed("ui/button.tsx", 900, "vendored")],
      [used("a.ts", 100)]
    )
    expect(stats.totalFiles).toBe(1)
    expect(stats.totalBytes).toBe(100)
    expect(stats.share).toBe(1)
  })

  /**
   * A file exported and then deleted is still spent volume, but it is no
   * longer in the denominator — the share must stay a share.
   */
  it("never reports more than the whole project", () => {
    const stats = projectStats([listed("a.ts", 100)], [
      used("a.ts", 100),
      used("deleted.ts", 5000),
    ])
    expect(stats.share).toBe(1)
    expect(stats.usedBytes).toBe(5100)
  })

  it("survives an empty listing without dividing by zero", () => {
    expect(projectStats([], []).share).toBe(0)
    expect(projectStats([], [used("gone.ts", 10)]).share).toBe(0)
  })
})
