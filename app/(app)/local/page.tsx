"use client"

import { useCallback, useMemo, useState } from "react"
import { FileWarningIcon, FilesIcon, XIcon } from "lucide-react"

import { FileDrop, type DroppedFile } from "@/components/local/file-drop"
import { DownloadButton } from "@/components/pdf/download-button"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { usePdfWorker } from "@/hooks/use-pdf-worker"
import { decodeSourceFile } from "@/lib/files/decode"
import { paginate, type MeasuredFile, type Metrics } from "@/lib/pdf/measure"
import type { SourceFile } from "@/lib/pdf/render"

type Accepted = SourceFile & { lines: number; titleLines: number }
type Rejected = { name: string; reason: string }

export default function LocalPage() {
  const { send } = usePdfWorker()

  const [accepted, setAccepted] = useState<Accepted[]>([])
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<number | null>(null)

  const addFiles = useCallback(
    async (dropped: DroppedFile[]) => {
      setError(null)
      setLastExport(null)

      const readable: SourceFile[] = []
      const failures: Rejected[] = []

      for (const file of dropped) {
        const decoded = decodeSourceFile(file.bytes)
        if (decoded.ok) {
          readable.push({
            name: file.name,
            bytes: file.bytes,
            text: decoded.text,
          })
        } else {
          failures.push({ name: file.name, reason: decoded.reason })
        }
      }

      setRejected((current) => [...current, ...failures])
      if (readable.length === 0) return

      try {
        // Measuring needs pdfkit, so it happens once per file in the worker.
        // The running total below is then pure arithmetic.
        const response = await send({
          type: "measure",
          files: readable.map((f) => ({ name: f.name, text: f.text })),
        })
        if (response.type !== "measured")
          throw new Error("Unexpected response.")

        setMetrics(response.metrics)
        setAccepted((current) => {
          const byName = new Map(current.map((f) => [f.name, f]))
          readable.forEach((file, index) =>
            byName.set(file.name, {
              ...file,
              lines: response.files[index].codeLines,
              titleLines: response.files[index].titleLines,
            })
          )
          return [...byName.values()]
        })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [send]
  )

  const ordered = useMemo(
    () => [...accepted].sort((a, b) => (a.name < b.name ? -1 : 1)),
    [accepted]
  )

  /**
   * The running total, recomputed from cached line counts on every change —
   * no re-render of the PDF. It equals the exported page count exactly; that
   * equality is what lib/pdf/measure.test.ts guards.
   */
  const totalPages = useMemo(() => {
    if (!metrics || ordered.length === 0) return 0
    const measured: MeasuredFile[] = ordered.map((file) => ({
      name: file.name,
      titleLines: file.titleLines,
      codeLines: file.lines,
    }))
    return paginate(measured, metrics)
  }, [ordered, metrics])

  const remove = (name: string) =>
    setAccepted((current) => current.filter((file) => file.name !== name))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Local export</h1>
        <p className="text-muted-foreground">
          Drop source files, watch the page count, download a print-ready PDF.
          No account, no upload.
        </p>
      </div>

      <FileDrop onFiles={addFiles} />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not process those files</AlertTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>Selection</CardTitle>
          <CardDescription>
            Alphabetical, one continuous flow — exactly how it will print.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">
              {totalPages} page{totalPages === 1 ? "" : "s"}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {ordered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilesIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing selected yet</EmptyTitle>
                <EmptyDescription>
                  Drop a few files above to see their page count.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((file) => (
                  <TableRow key={file.name}>
                    <TableCell className="font-mono">{file.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {file.lines}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => remove(file.name)}
                      >
                        <XIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {lastExport === null
                ? "The total above is what the PDF will contain."
                : `Exported ${lastExport} page${lastExport === 1 ? "" : "s"}.`}
            </p>
            <DownloadButton
              files={ordered.map(({ name, bytes, text }) => ({
                name,
                bytes,
                text,
              }))}
              send={send}
              onRendered={setLastExport}
              onError={setError}
            />
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
