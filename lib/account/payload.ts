/**
 * The only shape that may ask this service to erase an account.
 *
 * Deletion is irreversible and there is no undo, no grace period and no backup
 * the user can ask to be restored from — so it takes a typed confirmation, and
 * the confirmation is checked **here**, on the server. The dialog that asks for
 * it is markup: anything that can send a `DELETE` can skip it, so a rule that
 * lived only in the component would be a rule that guards nothing.
 *
 * Same Zod discipline as the app's other two write paths — the schema names the
 * one field it keeps and strips everything else.
 */

import { z } from "zod"

const DeleteAccountRequest = z.object({
  /** The account's own GitHub login, typed out by the person deleting it. */
  confirm: z.string(),
})

export type ParseResult = { ok: true } | { ok: false; error: string }

/**
 * `ok`/`error` rather than a throw — the caller owes the browser a 400.
 *
 * The comparison is trimmed and case-folded: GitHub logins are themselves
 * case-insensitive, and the field exists to make the act deliberate rather
 * than to test spelling. An empty login on either side fails closed, so a
 * session that somehow lost its identity can never delete anything.
 */
export function parseDeleteAccountRequest(
  payload: unknown,
  login: string | undefined
): ParseResult {
  const parsed = DeleteAccountRequest.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: "Type your GitHub username to confirm." }
  }

  const expected = (login ?? "").trim().toLowerCase()
  const given = parsed.data.confirm.trim().toLowerCase()

  if (!expected || !given || given !== expected) {
    return { ok: false, error: "That is not your GitHub username." }
  }

  return { ok: true }
}
