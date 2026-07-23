"use client"

import { ChevronsDownUpIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function TreeToolbar({
  onExpandAll,
  onCollapseAll,
  onClearSelection,
  selectedCount,
}: {
  onExpandAll: () => void
  onCollapseAll: () => void
  onClearSelection: () => void
  selectedCount: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onExpandAll}>
        <ChevronsUpDownIcon data-icon="inline-start" />
        Expand all
      </Button>
      <Button variant="outline" size="sm" onClick={onCollapseAll}>
        <ChevronsDownUpIcon data-icon="inline-start" />
        Collapse all
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={selectedCount === 0}
        onClick={onClearSelection}
      >
        <XIcon data-icon="inline-start" />
        Clear selection
      </Button>
    </div>
  )
}
