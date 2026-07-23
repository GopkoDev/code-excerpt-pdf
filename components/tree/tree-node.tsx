"use client"

import {
  CheckCheckIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  HistoryIcon,
  PackageIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { nodeState, type SelectionState } from "@/lib/tree/selection"
import type { TreeNode as Node } from "@/lib/tree/types"
import type { Verdict } from "@/lib/vendored"
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
  verdictFor: (node: Node) => Verdict | null
  onToggleVendored: (node: Node, verdict: Verdict | null) => void
  showEstimates: boolean
  showVendored: boolean
}

export function TreeNode(props: TreeNodeProps) {
  const {
    node,
    depth,
    selected,
    expanded,
    onToggleExpand,
    onToggleSelect,
    countsFor,
    verdictFor,
    onToggleVendored,
    showEstimates,
    showVendored,
  } = props

  const verdict = verdictFor(node)
  const isVendored = node.kind === "file" && node.entry.status === "vendored"

  // Hidden by default, per SPEC — but never removed from the tree, so the
  // toggle brings it straight back with its selection intact.
  if (isVendored && !showVendored) return null

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

        {verdict?.vendored && (
          <Badge variant="outline" title={verdict.reason} className="shrink-0">
            <PackageIcon />
            vendored
          </Badge>
        )}

        {/*
          Marked, never hidden and never disabled. SPEC forbids a used file
          silently re-entering a listing, not the user deciding to include it —
          the checkbox still works, and picking one warns first.
        */}
        {node.kind === "file" && node.entry.status === "used" && (
          <Badge
            variant="outline"
            title="Already exported, and the content has not changed since"
            className="shrink-0"
          >
            <CheckCheckIcon />
            used
          </Badge>
        )}

        {node.kind === "file" && node.entry.status === "used-but-changed" && (
          <Badge
            variant="secondary"
            title="Already exported, but the content has changed since — part of it is genuinely new"
            className="shrink-0"
          >
            <HistoryIcon />
            used · changed
          </Badge>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {node.kind === "file" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              title={
                verdict
                  ? verdict.reason
                  : "Mark this file as vendored so it stays out of listings"
              }
              onClick={() => onToggleVendored(node, verdict)}
            >
              {verdict?.vendored ? "Unmark" : "Mark vendored"}
            </Button>
          )}

          {showEstimates && counts.exact !== undefined && (
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
              {...props}
              node={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
