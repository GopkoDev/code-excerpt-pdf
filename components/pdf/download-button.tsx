"use client"

import { useState } from "react"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { SourceFile } from "@/lib/pdf/render"
import type { WorkerResponse } from "@/lib/pdf/worker-protocol"

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DownloadButton({
  resolveFiles,
  disabled,
  send,
  onError,
}: {
  /** Content is read lazily, at export time, for the selection only. */
  resolveFiles: () => Promise<SourceFile[]>
  disabled?: boolean
  send: (request: {
    type: "render"
    files: SourceFile[]
  }) => Promise<WorkerResponse>
  onError: (message: string) => void
}) {
  const [isRendering, setIsRendering] = useState(false)
  const [lastPageCount, setLastPageCount] = useState<number | null>(null)

  const download = async () => {
    setIsRendering(true)
    try {
      const files = await resolveFiles()
      const response = await send({ type: "render", files })
      if (response.type !== "rendered") throw new Error("Unexpected response.")
      saveBlob(response.blob, "code-excerpt.pdf")
      setLastPageCount(response.pageCount)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRendering(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {lastPageCount !== null && !isRendering && (
        <span className="text-sm text-muted-foreground">
          Exported {lastPageCount} page{lastPageCount === 1 ? "" : "s"}.
        </span>
      )}
      <Button disabled={disabled || isRendering} onClick={download}>
        {isRendering ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <DownloadIcon data-icon="inline-start" />
        )}
        {isRendering ? "Building PDF…" : "Download PDF"}
      </Button>
    </div>
  )
}
