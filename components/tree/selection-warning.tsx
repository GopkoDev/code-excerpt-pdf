"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type PendingWarning = {
  path: string
  reason: string
  kind: "vendored" | "used" | "used-but-changed"
}

/**
 * SPEC is explicit twice over: a vendored file is never hard-blocked, and a
 * used file may never *silently* re-enter a listing — silently being the
 * operative word. Both cases are therefore the same interaction, warn then
 * proceed, and share one dialog rather than two that could drift apart. The
 * confirm button is the primary action: this exists to make the choice
 * deliberate, not to prevent it.
 */
const COPY = {
  vendored: {
    title: "This file looks vendored",
    body: "Including code you did not write weakens a proof-of-authorship listing, but you know your project best.",
  },
  used: {
    title: "You have already exported this file",
    body: "It appeared in an earlier listing, unchanged. Including it again means the same material is filed twice.",
  },
  "used-but-changed": {
    title: "You have already exported an older version of this file",
    body: "The content has moved on since it was filed, so some of it is genuinely new — but part of this listing would repeat what you already submitted.",
  },
} as const

export function SelectionWarning({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingWarning | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const copy = pending ? COPY[pending.kind] : null

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{pending?.path}</span> —{" "}
            {pending?.reason}. {copy?.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Leave it out</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Add it anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
