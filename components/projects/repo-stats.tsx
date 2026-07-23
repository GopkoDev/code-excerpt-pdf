"use client"

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import type { ProjectStats } from "@/lib/uniqueness/stats"

/**
 * How much of this repository has already been filed.
 *
 * Costs **no** GitHub call, by construction: the numerator is the sum of
 * `UsedFile.sizeBytes` from our own ledger and the denominator is the tree
 * listing already in hand. That is the whole reason the size is recorded at
 * export time instead of looked up when the number is needed.
 *
 * Bytes, not pages — a page count would need every file measured, which needs
 * every file fetched, which is exactly the API spend the two-tier design
 * exists to avoid.
 */
export function RepoStats({ stats }: { stats: ProjectStats }) {
  if (stats.totalFiles === 0) return null

  const percent = Math.round(stats.share * 100)

  return (
    <Progress value={percent} className="gap-1">
      <ProgressLabel className="text-sm font-normal text-muted-foreground">
        {stats.usedFiles} of {stats.totalFiles} files already exported ·{" "}
        {formatBytes(stats.usedBytes)} of {formatBytes(stats.totalBytes)}
      </ProgressLabel>
      {/* Formats `value` against the default max of 100 on its own. */}
      <ProgressValue />
    </Progress>
  )
}

const UNITS = ["B", "kB", "MB", "GB"]

function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`
}
