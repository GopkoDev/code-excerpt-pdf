"use client"

import { useCallback } from "react"

import { FileDrop } from "@/components/local/file-drop"
import { SelectionPanel } from "@/components/selection/selection-panel"
import { useFileSelection } from "@/hooks/use-file-selection"
import { createLocalSource, toLocalFiles } from "@/lib/sources/local"

/**
 * Anonymous mode: no account, no upload, nothing persisted.
 *
 * Everything below the drop zone is `SelectionPanel` — the same component the
 * repository page renders. The only difference between the two modes is which
 * `ContentSource` gets loaded.
 */
export default function LocalPage() {
  const selection = useFileSelection()
  const { loadSource } = selection

  const receiveFiles = useCallback(
    (files: File[]) => loadSource(createLocalSource(toLocalFiles(files))),
    [loadSource]
  )

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Local export</h1>
        <p className="text-muted-foreground">
          Drop a folder, pick the files you want, watch the page count, download
          a print-ready PDF. No account, no upload.
        </p>
      </div>

      <FileDrop onFiles={receiveFiles} />

      <SelectionPanel
        selection={selection}
        emptyTitle="Nothing loaded yet"
        emptyDescription="Drop files or choose a folder to browse it as a tree."
      />
    </main>
  )
}
