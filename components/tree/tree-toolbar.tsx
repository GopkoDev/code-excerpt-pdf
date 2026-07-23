"use client"

import { ChevronsDownUpIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

export function TreeToolbar({
  onExpandAll,
  onCollapseAll,
  onClearSelection,
  selectedCount,
  showVendored,
  onShowVendoredChange,
  vendoredCount,
}: {
  onExpandAll: () => void
  onCollapseAll: () => void
  onClearSelection: () => void
  selectedCount: number
  showVendored: boolean
  onShowVendoredChange: (next: boolean) => void
  vendoredCount: number
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

      <label className="ml-auto flex items-center gap-2 text-sm">
        <Switch
          checked={showVendored}
          onCheckedChange={onShowVendoredChange}
          aria-label="Show vendored files"
        />
        <span className="text-muted-foreground">
          Show vendored{vendoredCount > 0 ? ` (${vendoredCount})` : ""}
        </span>
      </label>
    </div>
  )
}
