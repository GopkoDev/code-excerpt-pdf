"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { TreeNode, type NodeCounts } from "@/components/tree/tree-node"
import type { SelectionState } from "@/lib/tree/selection"
import type { TreeNode as Node } from "@/lib/tree/types"

export function TreeView({
  nodes,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelect,
  countsFor,
  showEstimates,
}: {
  nodes: Node[]
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  onToggleExpand: (path: string) => void
  onToggleSelect: (node: Node, state: SelectionState) => void
  countsFor: (node: Node) => NodeCounts
  showEstimates: boolean
}) {
  return (
    <ScrollArea className="h-[28rem] rounded-md border">
      <ul className="p-2">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selected={selected}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onToggleSelect={onToggleSelect}
            countsFor={countsFor}
            showEstimates={showEstimates}
          />
        ))}
      </ul>
    </ScrollArea>
  )
}
