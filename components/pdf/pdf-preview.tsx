"use client"

import { useEffect, useMemo } from "react"
import { ExternalLinkIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * Inline preview of the exact document the download produces.
 *
 * Uses the browser's own PDF viewer through an `<iframe>`: it costs nothing
 * and brings scrolling, zoom and print for free. pdf.js is ~1 MB and only
 * earns its place if page thumbnails or in-page navigation turn out to be
 * wanted.
 *
 * The blob is passed in, never rendered here — one render feeds both preview
 * and download, so the two can never disagree about the page count.
 */
export function PdfPreview({
  blob,
  pageCount,
  onClose,
}: {
  blob: Blob
  pageCount: number
  onClose: () => void
}) {
  // Derived, not stored: React 19 discourages setState inside an effect, and
  // the effect below exists purely to release the URL. Without the revoke
  // every preview leaks the whole document for the lifetime of the page.
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Preview</span>
        <Badge variant="secondary">
          {pageCount} page{pageCount === 1 ? "" : "s"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          This is the file the download button will save.
        </span>

        <div className="ml-auto flex items-center gap-1">
          {/* An external target, not a route — a styled <a> keeps link
              semantics without Base UI's button role. */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            data-slot="button"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open in a tab
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close preview"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      {
        <iframe
          src={url}
          title="PDF preview"
          className="h-[36rem] w-full rounded-md border"
        />
      }

      <p className="text-xs text-muted-foreground">
        Some browsers refuse to display PDFs inline. If the frame above is
        blank, use “Open in a tab”.
      </p>
    </div>
  )
}
