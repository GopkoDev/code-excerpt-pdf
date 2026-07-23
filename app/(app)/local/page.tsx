"use client"

import { useCallback, useMemo, useState } from "react"
import { FilesIcon, FileWarningIcon } from "lucide-react"

import { FileDrop } from "@/components/local/file-drop"
import { DownloadButton } from "@/components/pdf/download-button"
import { PageTotal } from "@/components/tree/page-total"
import { TreeToolbar } from "@/components/tree/tree-toolbar"
import { TreeView } from "@/components/tree/tree-view"
import type { NodeCounts } from "@/components/tree/tree-node"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { usePdfWorker } from "@/hooks/use-pdf-worker"
import { decodeSourceFile } from "@/lib/files/decode"
import { estimatePages, estimatePagesForSizes } from "@/lib/pdf/estimate"
import { paginate, type MeasuredFile, type Metrics } from "@/lib/pdf/measure"
import type { SourceFile } from "@/lib/pdf/render"
import { createLocalSource, toLocalFiles } from "@/lib/sources/local"
import { buildTree, flattenFiles } from "@/lib/tree/build"
import {
  deselectFolder,
  selectFolder,
  toggleFile,
  type SelectionState,
} from "@/lib/tree/selection"
import type { ContentSource, FileEntry, TreeNode } from "@/lib/tree/types"

/** The dev-only estimate column exists to keep the byte estimator calibrated. */
const SHOW_ESTIMATES = process.env.NODE_ENV === "development"

type Rejected = { name: string; reason: string }

export default function LocalPage() {
  const { send } = usePdfWorker()

  const [source, setSource] = useState<ContentSource | null>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [measured, setMeasured] = useState<Map<string, MeasuredFile>>(new Map())
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMeasuring, setIsMeasuring] = useState(false)

  const tree = useMemo(() => buildTree(entries), [entries])

  const receiveFiles = useCallback(
    (files: File[]) => {
      setError(null)
      setNotice(null)
      const local = toLocalFiles(files)
      const next = createLocalSource(local)
      setSource(next)
      setSelected(new Set())
      setMeasured(new Map())
      // Font metrics are needed to label the tree at all, and they do not depend
      // on any file. Fetch them up front, or every row would read "0p" until the
      // first selection happened to load them.
      void send({ type: "measure", files: [] }).then((response) => {
        if (response.type === "measured") setMetrics(response.metrics)
      })
      void next.listFiles().then((listed) => {
        setEntries(listed)
        // Open the top level so a dropped folder is not a single closed row.
        setExpanded(
          new Set(
            buildTree(listed)
              .filter((node) => node.kind === "folder")
              .map((node) => node.path)
          )
        )
      })
    },
    [send]
  )

  /**
   * Exact counts need content, so they are fetched and measured only for files
   * the user actually selected — and only once each. Everything already in
   * `measured` is reused, which is what keeps toggling cheap.
   */
  const measureSelected = useCallback(
    async (paths: ReadonlySet<string>) => {
      if (!source) return
      const missing = [...paths].filter((path) => !measured.has(path))
      if (missing.length === 0) return

      setIsMeasuring(true)
      try {
        const failures: Rejected[] = []
        const readable: { path: string; name: string; text: string }[] = []

        for (const path of missing) {
          const bytes = await source.readFile(path)
          const decoded = decodeSourceFile(bytes)
          if (decoded.ok) {
            readable.push({
              path,
              name: path.split("/").pop() ?? path,
              text: decoded.text,
            })
          } else {
            failures.push({ name: path, reason: decoded.reason })
          }
        }

        if (failures.length > 0) {
          setRejected((current) => [...current, ...failures])
          setSelected((current) => {
            const next = new Set(current)
            failures.forEach((f) => next.delete(f.name))
            return next
          })
        }

        if (readable.length > 0) {
          const response = await send({
            type: "measure",
            files: readable.map((f) => ({ name: f.name, text: f.text })),
          })
          if (response.type !== "measured")
            throw new Error("Unexpected response.")

          setMetrics(response.metrics)
          setMeasured((current) => {
            const next = new Map(current)
            readable.forEach((file, index) =>
              next.set(file.path, response.files[index])
            )
            return next
          })
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setIsMeasuring(false)
      }
    },
    [measured, send, source]
  )

  const applySelection = useCallback(
    (next: Set<string>) => {
      setSelected(next)
      void measureSelected(next)
    },
    [measureSelected]
  )

  const handleToggleSelect = useCallback(
    (node: TreeNode, state: SelectionState) => {
      if (node.kind === "file") {
        applySelection(toggleFile(node.path, selected))
        return
      }
      if (state === "all") {
        setNotice(null)
        applySelection(deselectFolder(node, selected))
        return
      }
      const change = selectFolder(node, selected)
      setNotice(
        `Added ${change.added}, skipped ${change.skippedUsed} used, ${change.skippedVendored} vendored.`
      )
      applySelection(change.selected)
    },
    [applySelection, selected]
  )

  const selectedFiles = useMemo(
    () => flattenFiles(tree).filter((file) => selected.has(file.path)),
    [tree, selected]
  )

  /** Pure arithmetic over cached counts — never a re-render of the PDF. */
  const totalPages = useMemo(() => {
    if (!metrics || selectedFiles.length === 0) return 0
    const files = selectedFiles
      .map((file) => measured.get(file.path))
      .filter((file): file is MeasuredFile => file !== undefined)
    if (files.length === 0) return 0
    return paginate(
      [...files].sort((a, b) => (a.name < b.name ? -1 : 1)),
      metrics
    )
  }, [selectedFiles, measured, metrics])

  const countsFor = useCallback(
    (node: TreeNode): NodeCounts => {
      if (!metrics) return { estimated: 0 }
      if (node.kind === "file") {
        const exact = measured.get(node.path)
        return {
          estimated: estimatePages(node.entry.sizeBytes, metrics),
          exact: exact ? paginate([exact], metrics) : undefined,
        }
      }
      const sizes = flattenFiles(node.children).map((f) => f.entry.sizeBytes)
      return { estimated: estimatePagesForSizes(sizes, metrics) }
    },
    [measured, metrics]
  )

  const toggleExpand = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })

  const allFolderPaths = useMemo(() => {
    const walk = (nodes: TreeNode[]): string[] =>
      nodes.flatMap((node) =>
        node.kind === "folder" ? [node.path, ...walk(node.children)] : []
      )
    return walk(tree)
  }, [tree])

  const exportFiles = useCallback(async (): Promise<SourceFile[]> => {
    if (!source) return []
    return Promise.all(
      selectedFiles.map(async (file) => {
        const bytes = await source.readFile(file.path)
        const decoded = decodeSourceFile(bytes)
        return {
          name: file.name,
          bytes,
          text: decoded.ok ? decoded.text : "",
        }
      })
    )
  }, [selectedFiles, source])

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

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rejected.length > 0 && (
        <Alert variant="destructive">
          <FileWarningIcon />
          <AlertTitle>
            Skipped {rejected.length} file{rejected.length === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {rejected.map((file) => (
                <li key={file.name}>
                  <span className="font-mono">{file.name}</span> — {file.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" onClick={() => setRejected([])}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      )}

      {notice && (
        <Alert>
          <AlertTitle>Folder added</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Selection</CardTitle>
          <CardDescription>
            Exported alphabetically as one continuous flow.
          </CardDescription>
          <CardAction>
            <PageTotal
              pages={totalPages}
              fileCount={selectedFiles.length}
              isMeasuring={isMeasuring}
            />
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {entries.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilesIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing loaded yet</EmptyTitle>
                <EmptyDescription>
                  Drop files or choose a folder to browse it as a tree.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TreeToolbar
                selectedCount={selected.size}
                onExpandAll={() => setExpanded(new Set(allFolderPaths))}
                onCollapseAll={() => setExpanded(new Set())}
                onClearSelection={() => setSelected(new Set())}
              />
              <TreeView
                nodes={tree}
                selected={selected}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onToggleSelect={handleToggleSelect}
                countsFor={countsFor}
                showEstimates={SHOW_ESTIMATES}
              />
            </>
          )}

          <div className="flex items-center justify-end">
            <DownloadButton
              resolveFiles={exportFiles}
              disabled={selectedFiles.length === 0}
              send={send}
              onError={setError}
            />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
