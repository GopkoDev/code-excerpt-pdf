"use client"

import type { ReactNode } from "react"
import { EyeIcon, FilesIcon, FileWarningIcon } from "lucide-react"

import { DownloadButton } from "@/components/pdf/download-button"
import { PdfPreview } from "@/components/pdf/pdf-preview"
import { PageTotal } from "@/components/tree/page-total"
import { TreeToolbar } from "@/components/tree/tree-toolbar"
import { TreeView } from "@/components/tree/tree-view"
import { SelectionWarning } from "@/components/tree/selection-warning"
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
import { Spinner } from "@/components/ui/spinner"
import type { FileSelection } from "@/hooks/use-file-selection"
import type { RenderResult } from "@/lib/pdf/render"

/** The dev-only estimate column exists to keep the byte estimator calibrated. */
const SHOW_ESTIMATES = process.env.NODE_ENV === "development"

/**
 * The selection experience itself: tree, running total, preview, download.
 *
 * Shared by anonymous mode and GitHub mode on purpose. SPEC requires the two
 * to behave identically — same tri-state selection, same running total, same
 * single render behind preview and download — and the cheapest way to
 * guarantee that is for there to be only one of it.
 */
export function SelectionPanel({
  selection,
  emptyTitle,
  emptyDescription,
  banner,
  onExported,
}: {
  selection: FileSelection
  emptyTitle: string
  emptyDescription: string
  /** Source-specific context, e.g. a truncated-tree warning. */
  banner?: ReactNode
  /**
   * Called once the user has actually saved a PDF, with the page count of the
   * run that produced those bytes.
   *
   * Optional because anonymous mode persists nothing — that is the whole point
   * of it — so the panel stays source-agnostic and GitHub mode supplies the
   * recording.
   */
  onExported?: (result: RenderResult) => void | Promise<void>
}) {
  const {
    entries,
    tree,
    selected,
    expanded,
    selectedFiles,
    totalPages,
    rejected,
    notice,
    error,
    isLoading,
    isMeasuring,
    isRendering,
    isPreviewOpen,
    rendered,
    showVendored,
    vendoredCount,
    pendingWarning,
    allFolderPaths,
  } = selection

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {banner}

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selection.setRejected([])}
            >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selection.setNotice(null)}
            >
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
                  {isLoading ? <Spinner /> : <FilesIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {isLoading ? "Loading the file list…" : emptyTitle}
                </EmptyTitle>
                <EmptyDescription>
                  {isLoading
                    ? "One request for the whole tree — sizes included."
                    : emptyDescription}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TreeToolbar
                selectedCount={selected.size}
                onExpandAll={() =>
                  selection.setExpanded(new Set(allFolderPaths))
                }
                onCollapseAll={() => selection.setExpanded(new Set())}
                onClearSelection={() => selection.setSelected(new Set())}
                showVendored={showVendored}
                onShowVendoredChange={selection.setShowVendored}
                vendoredCount={vendoredCount}
              />
              <TreeView
                nodes={tree}
                selected={selected}
                expanded={expanded}
                onToggleExpand={selection.toggleExpand}
                onToggleSelect={selection.handleToggleSelect}
                countsFor={selection.countsFor}
                verdictFor={selection.verdictFor}
                onToggleVendored={selection.handleToggleVendored}
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
                selection
                  .renderOnce()
                  .then(() => selection.setIsPreviewOpen(true))
                  .catch((cause) =>
                    selection.setError(
                      cause instanceof Error ? cause.message : String(cause)
                    )
                  )
              }}
            >
              <EyeIcon data-icon="inline-start" />
              {isRendering ? "Building…" : "Preview"}
            </Button>
            <DownloadButton
              render={selection.renderOnce}
              disabled={selectedFiles.length === 0}
              onError={selection.setError}
              onExported={onExported}
            />
          </div>

          {isPreviewOpen && rendered && (
            <PdfPreview
              blob={rendered.blob}
              pageCount={rendered.pageCount}
              onClose={() => selection.setIsPreviewOpen(false)}
            />
          )}
        </CardContent>
      </Card>

      <SelectionWarning
        pending={pendingWarning}
        onCancel={() => selection.setPendingWarning(null)}
        onConfirm={selection.confirmWarning}
      />
    </>
  )
}
