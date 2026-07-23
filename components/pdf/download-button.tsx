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
  files,
  send,
  onRendered,
  onError,
}: {
  files: SourceFile[]
  send: (request: {
    type: "render"
    files: SourceFile[]
  }) => Promise<WorkerResponse>
  onRendered: (pageCount: number) => void
  onError: (message: string) => void
}) {
  const [isRendering, setIsRendering] = useState(false)

  const download = async () => {
    setIsRendering(true)
    try {
      const response = await send({ type: "render", files })
      if (response.type !== "rendered") throw new Error("Unexpected response.")
      saveBlob(response.blob, "code-excerpt.pdf")
      onRendered(response.pageCount)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRendering(false)
    }
  }

  return (
    <Button disabled={files.length === 0 || isRendering} onClick={download}>
      {isRendering ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      {isRendering ? "Building PDF…" : "Download PDF"}
    </Button>
  )
}
