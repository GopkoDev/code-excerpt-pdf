"use client"

import { useRef, useState } from "react"
import { UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DroppedFile = { name: string; bytes: Uint8Array }

async function readFiles(list: FileList | null): Promise<DroppedFile[]> {
  if (!list) return []
  return Promise.all(
    Array.from(list).map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }))
  )
}

export function FileDrop({
  onFiles,
  disabled,
}: {
  onFiles: (files: DroppedFile[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const accept = async (list: FileList | null) => {
    const files = await readFiles(list)
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
        if (!disabled) void accept(event.dataTransfer.files)
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors",
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
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          void accept(event.target.files)
          event.target.value = ""
        }}
      />

      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  )
}
