"use client"

import { useCallback, useMemo, useState } from "react"
import { EyeIcon, FilesIcon, FileWarningIcon } from "lucide-react"

import { FileDrop } from "@/components/local/file-drop"
import { DownloadButton } from "@/components/pdf/download-button"
import { PdfPreview } from "@/components/pdf/pdf-preview"
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
import {
  VendoredWarning,
  type PendingVendored,
} from "@/components/tree/vendored-warning"
import { usePdfWorker } from "@/hooks/use-pdf-worker"
import { decodeSourceFile } from "@/lib/files/decode"
import { estimatePages, estimatePagesForFiles } from "@/lib/pdf/estimate"
import { paginate, type MeasuredFile, type Metrics } from "@/lib/pdf/measure"
import {
  selectionSignature,
  type RenderResult,
  type SourceFile,
} from "@/lib/pdf/render"
import { createLocalSource, toLocalFiles } from "@/lib/sources/local"
import { buildTree, commonRoot, flattenFiles } from "@/lib/tree/build"
import {
  deselectFolder,
  selectFolder,
  toggleFile,
  type SelectionState,
} from "@/lib/tree/selection"
import type { ContentSource, FileEntry, TreeNode } from "@/lib/tree/types"
import {
  createVendoredResolver,
  type ManualOverride,
  type Verdict,
} from "@/lib/vendored"

/** The dev-only estimate column exists to keep the byte estimator calibrated. */
const SHOW_ESTIMATES = process.env.NODE_ENV === "development"

type Rejected = { path: string; reason: string }

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
  const [overrides, setOverrides] = useState<ManualOverride[]>([])
  const [showVendored, setShowVendored] = useState(false)
  const [repoConfig, setRepoConfig] = useState<{
    gitattributes?: string
    componentsJson?: string
  }>({})
  const [pendingVendored, setPendingVendored] =
    useState<PendingVendored | null>(null)
  const [repoRoot, setRepoRoot] = useState("")
  const [rendered, setRendered] = useState<{
    signature: string
    result: RenderResult
  } | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isRendering, setIsRendering] = useState(false)

  const resolveVendored = useMemo(
    () =>
      createVendoredResolver({
        gitattributes: repoConfig.gitattributes,
        componentsJson: repoConfig.componentsJson,
        overrides,
      }),
    [repoConfig, overrides]
  )

  /** Detection rules are written against repo-relative paths. */
  const relative = useCallback(
    (path: string) =>
      repoRoot === "" ? path : path.slice(repoRoot.length + 1),
    [repoRoot]
  )

  /**
   * Vendored status is *derived*, never stored: an override has to be able to
   * flip it back, and a folder rule has to reach files listed later. Only
   * `unsupported` is sticky, because it records something that was actually
   * discovered by reading the file.
   */
  const classified = useMemo(
    () =>
      entries.map((entry) => {
        if (entry.status === "unsupported") return entry
        const verdict = resolveVendored(relative(entry.path))
        return {
          ...entry,
          status: verdict?.vendored
            ? ("vendored" as const)
            : ("available" as const),
        }
      }),
    [entries, resolveVendored, relative]
  )

  const tree = useMemo(() => buildTree(classified), [classified])

  const verdictFor = useCallback(
    (node: TreeNode): Verdict | null =>
      node.kind === "file" ? resolveVendored(relative(node.path)) : null,
    [resolveVendored, relative]
  )

  const vendoredCount = useMemo(
    () => classified.filter((entry) => entry.status === "vendored").length,
    [classified]
  )

  const setOverride = useCallback(
    (path: string, scope: "file" | "folder", vendored: boolean) =>
      setOverrides((current) => [
        ...current.filter(
          (item) => !(item.path === path && item.scope === scope)
        ),
        { path, scope, vendored },
      ]),
    []
  )

  const handleToggleVendored = useCallback(
    (node: TreeNode, verdict: Verdict | null) =>
      setOverride(relative(node.path), "file", !verdict?.vendored),
    [relative, setOverride]
  )

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
      void next.listFiles().then(async (listed) => {
        // Repo config drives vendored detection, and a directory picker
        // prefixes every path with the dropped folder's own name — so look
        // for it relative to the folder every path shares, not the root.
        const root = commonRoot(listed.map((entry) => entry.path))
        const at = (name: string) => (root === "" ? name : `${root}/${name}`)
        const readIfPresent = async (name: string) => {
          if (!listed.some((entry) => entry.path === at(name))) return undefined
          try {
            return new TextDecoder().decode(await next.readFile(at(name)))
          } catch {
            return undefined
          }
        }
        setRepoRoot(root)
        setRepoConfig({
          gitattributes: await readIfPresent(".gitattributes"),
          componentsJson: await readIfPresent("components.json"),
        })

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
            failures.push({ path, reason: decoded.reason })
          }
        }

        if (failures.length > 0) {
          const failed = new Set(failures.map((failure) => failure.path))

          // Mark them, do not merely deselect them. A file left `available`
          // after failing gets re-added by the next bulk select, fails again,
          // and leaves its folder permanently indeterminate.
          setEntries((current) =>
            current.map((entry) =>
              failed.has(entry.path)
                ? { ...entry, status: "unsupported" as const }
                : entry
            )
          )
          setRejected((current) => {
            const seen = new Set(current.map((item) => item.path))
            return [
              ...current,
              ...failures.filter((failure) => !seen.has(failure.path)),
            ]
          })
          setSelected((current) => {
            const next = new Set(current)
            failed.forEach((path) => next.delete(path))
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
      // A preview of a selection the user has moved on from is worse than no
      // preview: it looks current and is not.
      setIsPreviewOpen(false)
      void measureSelected(next)
    },
    [measureSelected]
  )

  const handleToggleSelect = useCallback(
    (node: TreeNode, state: SelectionState) => {
      if (node.kind === "file") {
        const verdict = verdictFor(node)
        // Warn, never block: SPEC forbids hard-blocking a vendored file.
        if (verdict?.vendored && !selected.has(node.path)) {
          setPendingVendored({ path: node.path, reason: verdict.reason })
          return
        }
        applySelection(toggleFile(node.path, selected))
        return
      }
      if (state === "all") {
        setNotice(null)
        applySelection(deselectFolder(node, selected))
        return
      }
      const change = selectFolder(node, selected)
      const skipped = [
        change.skippedUsed > 0 && `${change.skippedUsed} used`,
        change.skippedVendored > 0 && `${change.skippedVendored} vendored`,
        change.skippedUnsupported > 0 &&
          `${change.skippedUnsupported} not text`,
      ].filter(Boolean)
      setNotice(
        `Added ${change.added}` +
          (skipped.length > 0 ? `, skipped ${skipped.join(", ")}` : "") +
          "."
      )
      applySelection(change.selected)
    },
    [applySelection, selected, verdictFor]
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
          estimated: estimatePages(node.entry.sizeBytes, metrics, node.name),
          exact: exact ? paginate([exact], metrics) : undefined,
        }
      }
      // A folder's total is its files paginated as ONE flow, never the sum of
      // their individual counts: each file alone rounds up to a whole page,
      // but in the export the next file starts on the page the last one ended.
      // Summing would over-state the folder by a page per file.
      const files = flattenFiles(node.children)
      const counts = files.map((file) => measured.get(file.path))
      const allMeasured =
        files.length > 0 && counts.every((count) => count !== undefined)

      return {
        estimated: estimatePagesForFiles(
          files.map((file) => ({
            name: file.name,
            sizeBytes: file.entry.sizeBytes,
          })),
          metrics
        ),
        exact: allMeasured
          ? paginate(
              (counts as MeasuredFile[])
                .slice()
                .sort((a, b) => (a.name < b.name ? -1 : 1)),
              metrics
            )
          : undefined,
      }
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

  /**
   * ONE render feeds both the preview and the download. Rendering twice would
   * give two page counts free to disagree — the drift the single-run rule in
   * lib/pdf/render.ts exists to prevent.
   */
  const renderOnce = useCallback(async (): Promise<RenderResult> => {
    const files = await exportFiles()
    const signature = selectionSignature(files)
    if (rendered?.signature === signature) return rendered.result

    setIsRendering(true)
    try {
      const response = await send({ type: "render", files })
      if (response.type !== "rendered") throw new Error("Unexpected response.")
      const result: RenderResult = {
        blob: response.blob,
        pageCount: response.pageCount,
        files: response.files,
      }
      setRendered({ signature, result })
      return result
    } finally {
      setIsRendering(false)
    }
  }, [exportFiles, rendered, send])

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
                <li key={file.path}>
                  <span className="font-mono">{file.path}</span> — {file.reason}
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
                showVendored={showVendored}
                onShowVendoredChange={setShowVendored}
                vendoredCount={vendoredCount}
              />
              <TreeView
                nodes={tree}
                selected={selected}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onToggleSelect={handleToggleSelect}
                countsFor={countsFor}
                verdictFor={verdictFor}
                onToggleVendored={handleToggleVendored}
                showEstimates={SHOW_ESTIMATES}
                showVendored={showVendored}
              />
            </>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={selectedFiles.length === 0 || isRendering}
              onClick={() => {
                renderOnce()
                  .then(() => setIsPreviewOpen(true))
                  .catch((cause) =>
                    setError(
                      cause instanceof Error ? cause.message : String(cause)
                    )
                  )
              }}
            >
              <EyeIcon data-icon="inline-start" />
              {isRendering ? "Building…" : "Preview"}
            </Button>
            <DownloadButton
              render={renderOnce}
              disabled={selectedFiles.length === 0}
              onError={setError}
            />
          </div>

          {isPreviewOpen && rendered && (
            <PdfPreview
              blob={rendered.result.blob}
              pageCount={rendered.result.pageCount}
              onClose={() => setIsPreviewOpen(false)}
            />
          )}
        </CardContent>
      </Card>
      <VendoredWarning
        pending={pendingVendored}
        onCancel={() => setPendingVendored(null)}
        onConfirm={() => {
          if (pendingVendored) {
            applySelection(toggleFile(pendingVendored.path, selected))
          }
          setPendingVendored(null)
        }}
      />
    </main>
  )
}
