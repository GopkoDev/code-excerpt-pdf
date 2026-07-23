/**
 * The only shape a browser can push into the `Classification` table.
 *
 * `POST /api/classifications` is the app's second write path, so it gets the
 * same treatment as the first: Zod names every field it keeps and strips the
 * rest, which is what stops a client from smuggling anything content-shaped
 * alongside a path. Read the field list as the complete inventory.
 *
 * The path is held to the same rule the export payload applies, because it is
 * the same kind of value — a stored instruction about a repository path — and
 * it comes back out as a glob the resolver evaluates against every file.
 */

import { z } from "zod"

import { RepoPath } from "../exports/payload"
import { isValidOwner, isValidRepoName } from "../github/repo-id"

const ClassificationRequest = z.object({
  repo: z.object({
    owner: z.string().refine(isValidOwner),
    name: z.string().refine(isValidRepoName),
  }),
  override: z.object({
    path: RepoPath,
    /** A folder rule cascades to every descendant, including future ones. */
    scope: z.enum(["file", "folder"]),
    vendored: z.boolean(),
  }),
})

export type ClassificationRequest = z.infer<typeof ClassificationRequest>

export type ParseResult =
  | { ok: true; value: ClassificationRequest }
  | { ok: false; error: string }

/** `ok`/`error` rather than a throw — the caller owes the browser a 400. */
export function parseClassificationRequest(payload: unknown): ParseResult {
  const parsed = ClassificationRequest.safeParse(payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first
        ? `Invalid classification payload at ${first.path.join(".") || "(root)"}.`
        : "Invalid classification payload.",
    }
  }
  return { ok: true, value: parsed.data }
}
