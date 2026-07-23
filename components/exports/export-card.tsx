"use client"

import { useState } from "react"
import { DownloadIcon, FileWarningIcon, UnplugIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { usePdfWorker } from "@/hooks/use-pdf-worker"
import { collectPinnedFiles } from "@/lib/exports/regenerate"
import { decodeSourceFile } from "@/lib/files/decode"
import { githubApiFetch } from "@/lib/github/refreshing-fetch"

/** `ExportSummary` as it survives JSON — `createdAt` arrives as a string. */
export type ExportRow = {
  id: string
  createdAt: string
  actualPages: number
  repo: { owner: string; name: string; defaultBranch?: string } | null
  files: {
    path: string
    commitSha: string
    contentHash: string
    sizeBytes: number
  }[]
}

type Outcome =
  | { kind: "rebuilt"; pageCount: number; changed: string[]; missing: string[] }
  | { kind: "source-gone"; reason: string }
  | { kind: "failed"; message: string }

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * One past export, and the button that rebuilds it.
 *
 * Nothing about the original document is stored — that is the NDA constraint —
 * so "re-download" means re-fetching every file at the commit SHA it was
 * pinned to and rendering it again through the same worker the original went
 * through. The page count of the rebuild is shown beside the recorded one
 * **for information only**: SPEC is explicit that it is never a gate, because
 * a difference means the repository moved on, not that the user did anything
 * wrong.
 */
export function ExportCard({ row }: { row: ExportRow }) {
  const { send } = usePdfWorker()
  const [isWorking, setIsWorking] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const rebuild = async () => {
    if (!row.repo) {
      setOutcome({
        kind: "source-gone",
        reason:
          "This export is no longer linked to a repository, so there is nothing left to re-fetch.",
      })
      return
    }

    setIsWorking(true)
    setOutcome(null)
    try {
      const collected = await collectPinnedFiles(row.repo, row.files, {
        fetcher: githubApiFetch,
      })

      if (collected.kind === "source-gone") {
        setOutcome({ kind: "source-gone", reason: collected.reason })
        return
      }
      if (collected.files.length === 0) {
        setOutcome({
          kind: "source-gone",
          reason:
            "None of the files in this export still exist at the revision they were filed from.",
        })
        return
      }

      const response = await send({
        type: "render",
        files: collected.files.map((file) => {
          const decoded = decodeSourceFile(file.bytes)
          return {
            name: file.name,
            bytes: file.bytes,
            text: decoded.ok ? decoded.text : "",
          }
        }),
      })
      if (response.type !== "rendered") throw new Error("Unexpected response.")

      saveBlob(response.blob, `code-excerpt-${row.id}.pdf`)
      setOutcome({
        kind: "rebuilt",
        pageCount: response.pageCount,
        changed: collected.changed,
        missing: collected.missing.map((file) => file.path),
      })
    } catch (cause) {
      setOutcome({
        kind: "failed",
        message: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">
          {row.repo ? `${row.repo.owner}/${row.repo.name}` : "Unknown repository"}
        </CardTitle>
        <CardDescription>
          {new Date(row.createdAt).toLocaleString()} · {row.files.length} file
          {row.files.length === 1 ? "" : "s"}
        </CardDescription>
        <CardAction className="flex items-center gap-3">
          <Badge variant="secondary" title="Pages in the PDF that was filed">
            {row.actualPages}p
          </Badge>
          <Button
            variant="outline"
            disabled={isWorking}
            onClick={() => void rebuild()}
          >
            {isWorking ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {isWorking ? "Rebuilding…" : "Re-download"}
          </Button>
        </CardAction>
      </CardHeader>

      {outcome && (
        <CardContent className="flex flex-col gap-3">
          {outcome.kind === "rebuilt" && (
            <>
              <Alert>
                <AlertTitle>
                  Rebuilt {outcome.pageCount} page
                  {outcome.pageCount === 1 ? "" : "s"}
                  {outcome.pageCount === row.actualPages
                    ? ""
                    : ` — the original was ${row.actualPages}`}
                </AlertTitle>
                <AlertDescription>
                  {outcome.pageCount === row.actualPages
                    ? "Identical to what was filed."
                    : "A difference means the repository moved on since this was filed. The recorded count is what was submitted; this one is what the source says today."}
                </AlertDescription>
              </Alert>

              {outcome.changed.length > 0 && (
                <Alert>
                  <FileWarningIcon />
                  <AlertTitle>
                    {outcome.changed.length} file
                    {outcome.changed.length === 1 ? "" : "s"} no longer match
                    what was filed
                  </AlertTitle>
                  <AlertDescription>
                    <ul className="flex flex-col gap-1">
                      {outcome.changed.map((path) => (
                        <li key={path} className="font-mono">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {outcome.missing.length > 0 && (
                <Alert variant="destructive">
                  <FileWarningIcon />
                  <AlertTitle>
                    {outcome.missing.length} file
                    {outcome.missing.length === 1 ? "" : "s"} could not be
                    fetched
                  </AlertTitle>
                  <AlertDescription>
                    They are missing from the rebuilt document. Use the copy you
                    emailed yourself if you need the original exactly.
                    <ul className="flex flex-col gap-1">
                      {outcome.missing.map((path) => (
                        <li key={path} className="font-mono">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {outcome.kind === "source-gone" && (
            <Alert variant="destructive">
              <UnplugIcon />
              <AlertTitle>The source is gone</AlertTitle>
              <AlertDescription>
                {outcome.reason} Nothing about the document itself was ever
                stored, so it cannot be rebuilt from here — use the copy you
                emailed yourself when you filed it.
              </AlertDescription>
            </Alert>
          )}

          {outcome.kind === "failed" && (
            <Alert variant="destructive">
              <AlertTitle>Could not rebuild this export</AlertTitle>
              <AlertDescription>
                {outcome.message} This is not the same as the source being gone
                — try again.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  )
}
