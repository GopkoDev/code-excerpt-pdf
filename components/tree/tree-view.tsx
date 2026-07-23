"use client"

import { TreeNode, type NodeCounts } from "@/components/tree/tree-node"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SelectionState } from "@/lib/tree/selection"
import type { TreeNode as Node } from "@/lib/tree/types"
import type { Verdict } from "@/lib/vendored"

export function TreeView({
  nodes,
  ...rest
}: {
  nodes: Node[]
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  onToggleExpand: (path: string) => void
  onToggleSelect: (node: Node, state: SelectionState) => void
  countsFor: (node: Node) => NodeCounts
  verdictFor: (node: Node) => Verdict | null
  onToggleVendored: (node: Node, verdict: Verdict | null) => void
  showEstimates: boolean
  showVendored: boolean
}) {
  return (
    <ScrollArea className="h-[28rem] rounded-md border">
      <ul className="p-2">
        {nodes.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} {...rest} />
        ))}
      </ul>
    </ScrollArea>
  )
}
