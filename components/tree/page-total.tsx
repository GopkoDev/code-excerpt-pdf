"use client"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

/**
 * The running page total.
 *
 * Deliberately display-only. SPEC forbids a target field anywhere in the UI:
 * the app counts pages, the user decides how many are needed. No threshold, no
 * validation, no payout arithmetic.
 */
export function PageTotal({
  pages,
  fileCount,
  isMeasuring,
}: {
  pages: number
  fileCount: number
  isMeasuring: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <span className="text-2xl font-bold tabular-nums">
          {isMeasuring ? "…" : pages}
        </span>
        <span className="text-xs text-muted-foreground">
          page{pages === 1 ? "" : "s"}
        </span>
      </div>
      <Badge variant="secondary">
        {fileCount} file{fileCount === 1 ? "" : "s"}
      </Badge>
      {isMeasuring && <Spinner />}
    </div>
  )
}
