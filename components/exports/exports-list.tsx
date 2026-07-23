"use client"

import { useEffect, useState } from "react"
import { FileClockIcon } from "lucide-react"

import { ExportCard, type ExportRow } from "@/components/exports/export-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Every export this account has recorded, newest first.
 *
 * A client component because the list is our own API, not GitHub — but note
 * that opening this page costs zero GitHub calls. A rebuild is the only thing
 * that touches the API, and only for the export the user asked for.
 */
export function ExportsList() {
  const [rows, setRows] = useState<ExportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/exports")
        const body = (await response.json()) as {
          exports?: ExportRow[]
          error?: string
        }
        if (!response.ok || !body.exports) {
          throw new Error(body.error ?? "Could not read your export history.")
        }
        if (active) setRows(body.exports)
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load your exports</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (rows === null) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileClockIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing exported yet</EmptyTitle>
          <EmptyDescription>
            Every PDF you export from a repository is recorded here, so the
            files in it can never quietly appear in a later listing.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <ExportCard key={row.id} row={row} />
      ))}
    </div>
  )
}
