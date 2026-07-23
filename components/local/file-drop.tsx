"use client"

import { useEffect, useRef, useState } from "react"
import { FolderUpIcon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function FileDrop({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void
  disabled?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  // `webkitdirectory` has no JSX prop, and React would warn about the raw
  // attribute casing, so it is set imperatively.
  useEffect(() => {
    const input = folderInputRef.current
    if (!input) return
    input.setAttribute("webkitdirectory", "")
    input.setAttribute("directory", "")
  }, [])

  const accept = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsOver(false)
        if (!disabled) accept(event.dataTransfer.files)
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center transition-colors",
        isOver && "border-primary bg-accent",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <UploadIcon className="size-6 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">Drop source files here</p>
        <p className="text-sm text-muted-foreground">
          Nothing leaves your machine — the PDF is built in your browser.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ""
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ""
        }}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose files
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderUpIcon data-icon="inline-start" />
          Choose folder
        </Button>
      </div>
    </div>
  )
}
