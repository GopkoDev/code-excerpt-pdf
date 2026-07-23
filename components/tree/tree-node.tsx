"use client"

import { ChevronRightIcon, FileIcon, FolderIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { nodeState, type SelectionState } from "@/lib/tree/selection"
import type { TreeNode as Node } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

export type NodeCounts = {
  /** Estimated pages, from size alone. Always available. */
  estimated: number
  /** Exact pages, once the content has been measured. */
  exact?: number
}

export type TreeNodeProps = {
  node: Node
  depth: number
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  onToggleExpand: (path: string) => void
  onToggleSelect: (node: Node, state: SelectionState) => void
  countsFor: (node: Node) => NodeCounts
  showEstimates: boolean
}

export function TreeNode({
  node,
  depth,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelect,
  countsFor,
  showEstimates,
}: TreeNodeProps) {
  const state = nodeState(node, selected)
  const isFolder = node.kind === "folder"
  const isOpen = expanded.has(node.path)
  const counts = countsFor(node)

  const unavailable = node.kind === "file" && node.entry.status !== "available"

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-accent"
        style={{ paddingLeft: `${depth * 1.25 + 0.25}rem` }}
      >
        {isFolder ? (
          <button
            type="button"
            aria-label={
              isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`
            }
            onClick={() => onToggleExpand(node.path)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronRightIcon
              className={cn(
                "size-4 transition-transform",
                isOpen && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="size-4" />
        )}

        <Checkbox
          checked={state === "all"}
          indeterminate={state === "partial"}
          disabled={isFolder ? node.availableCount === 0 : false}
          aria-label={`Select ${node.path}`}
          onCheckedChange={() => onToggleSelect(node, state)}
        />

        {isFolder ? (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        )}

        <span
          className={cn(
            "truncate font-mono text-sm",
            unavailable && "text-muted-foreground line-through"
          )}
        >
          {node.name}
        </span>

        {isFolder && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {node.availableCount}/{node.fileCount}
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {showEstimates && counts.exact !== undefined && (
            // Dev-only, and only worth showing next to an exact figure: the
            // byte estimator is what the running total rests on once GitHub is
            // involved, and anonymous mode would otherwise never exercise it.
            <span className="font-mono text-xs text-muted-foreground">
              ~{counts.estimated}
            </span>
          )}
          <Badge
            variant={counts.exact === undefined ? "outline" : "secondary"}
            title={
              counts.exact === undefined
                ? "Estimated from file size — select the file to measure it exactly"
                : "Exact page count"
            }
          >
            {/* A bare number must always mean an exact count. An estimate says
                so, or it reads as fact and quietly contradicts the total. */}
            {counts.exact === undefined
              ? `~${counts.estimated}p`
              : `${counts.exact}p`}
          </Badge>
        </span>
      </div>

      {isFolder && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              countsFor={countsFor}
              showEstimates={showEstimates}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
