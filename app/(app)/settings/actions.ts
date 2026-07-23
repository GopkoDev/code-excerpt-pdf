"use server"

import { auth, signOut } from "@/auth"
import { parseDeleteAccountRequest } from "@/lib/account/payload"
import { accountDb } from "@/lib/db/account-db"
import { deleteAccount } from "@/lib/db/account"

/**
 * Account deletion, as a Server Action rather than a route handler.
 *
 * Two reasons, both structural. The session cookie has to be cleared in the
 * same step — a JWT that still names a deleted account would keep the user
 * browsing as a ghost, and the very next export would upsert the `User` row
 * back into existence — and clearing it means writing a cookie, which only a
 * Server Action or a route handler may do. And the confirmation must be
 * checked somewhere a client cannot skip, which rules out the dialog.
 *
 * The identity is re-read from the session here rather than trusted from the
 * form, so the only account this action can ever delete is the caller's own.
 */
export type DeleteAccountState = { error: string | null }

export async function deleteAccountAction(
  _previous: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const session = await auth()
  if (!session?.githubId) {
    return { error: "You are not signed in." }
  }

  const confirmation = parseDeleteAccountRequest(
    { confirm: formData.get("confirm") },
    session.githubLogin
  )
  if (!confirmation.ok) {
    return { error: confirmation.error }
  }

  try {
    await deleteAccount(accountDb, session.githubId)
  } catch {
    // Deliberately not surfaced verbatim: it could name the database or carry
    // the connection string. Nothing was signed out, so a retry is safe —
    // `deleteAccount` removes children first and is idempotent.
    return { error: "Could not delete your account. Please try again." }
  }

  // Throws NEXT_REDIRECT, so nothing below it runs.
  await signOut({ redirectTo: "/" })
  return { error: null }
}
