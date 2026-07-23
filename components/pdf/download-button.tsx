"use client"

import { useState } from "react"
import { DownloadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { RenderResult } from "@/lib/pdf/render"

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DownloadButton({
  render,
  disabled,
  onError,
}: {
  /**
   * Produces the document — served from the shared render cache, so the bytes
   * saved here are the same ones the preview showed.
   */
  render: () => Promise<RenderResult>
  disabled?: boolean
  onError: (message: string) => void
}) {
  const [isRendering, setIsRendering] = useState(false)
  const [lastPageCount, setLastPageCount] = useState<number | null>(null)

  const download = async () => {
    setIsRendering(true)
    try {
      const result = await render()
      saveBlob(result.blob, "code-excerpt.pdf")
      setLastPageCount(result.pageCount)
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
