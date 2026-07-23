"use client"

import { useActionState, useId, useState } from "react"
import { Trash2Icon, TriangleAlertIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

/** Mirrors the Server Action's return shape; kept structural, not imported. */
export type DeleteAccountState = { error: string | null }

/**
 * Deleting the account, behind a typed confirmation.
 *
 * There is no undo, no grace period and no backup to be restored from — the
 * rows are gone — so a single click is the wrong interaction. Typing the
 * account's own name is the smallest thing that makes the act deliberate
 * without making it a puzzle.
 *
 * This half is a convenience: the same rule is enforced in the Server Action,
 * where a client cannot skip it (`lib/account/payload.ts`). A disabled button
 * is a hint, never a guarantee.
 */
export function DeleteAccountDialog({
  login,
  action,
}: {
  login: string
  action: (
    state: DeleteAccountState,
    formData: FormData
  ) => Promise<DeleteAccountState>
}) {
  const [state, submit, isPending] = useActionState(action, { error: null })
  const [typed, setTyped] = useState("")
  const inputId = useId()

  const matches = typed.trim().toLowerCase() === login.trim().toLowerCase()

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="destructive">
            <Trash2Icon data-icon="inline-start" />
            Delete account
          </Button>
        }
      />
      <AlertDialogContent>
        <form action={submit} className="flex flex-col gap-4">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlertIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this account for good?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account, your repository list, every recorded export and its
              uniqueness ledger, your manual classifications and the cached
              listings all go. Nothing is archived and nothing can be restored.
              Files you have already exported become selectable again, because
              the record that they were used will no longer exist.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <FieldGroup>
            <Field data-invalid={state.error ? true : undefined}>
              <FieldLabel htmlFor={inputId}>
                Type <span className="font-mono">{login}</span> to confirm
              </FieldLabel>
              <Input
                id={inputId}
                name="confirm"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={typed}
                aria-invalid={state.error ? true : undefined}
                onChange={(event) => setTyped(event.target.value)}
              />
              <FieldDescription>
                Download your data first if you want a copy — this is the last
                moment it exists.
              </FieldDescription>
              {state.error && <FieldError>{state.error}</FieldError>}
            </Field>
          </FieldGroup>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              disabled={!matches || isPending}
            >
              {isPending && <Spinner data-icon="inline-start" />}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
