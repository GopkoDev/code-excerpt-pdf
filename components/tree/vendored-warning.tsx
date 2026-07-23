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

export type PendingVendored = { path: string; reason: string }

/**
 * SPEC is explicit that a vendored file is never hard-blocked: adding one
 * warns, then proceeds if the user says so. The dialog exists to make the
 * choice deliberate, not to prevent it — so the confirm button is the
 * primary action, not a buried one.
 */
export function VendoredWarning({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingVendored | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This file looks vendored</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{pending?.path}</span> —{" "}
            {pending?.reason}. Including code you did not write weakens a
            proof-of-authorship listing, but you know your project best.
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
