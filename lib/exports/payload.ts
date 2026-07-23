/**
 * The only shape a browser can push into the export ledger.
 *
 * `POST /api/exports` is one of the app's two write paths — the other is
 * `/api/classifications`, guarded the same way — so this schema is where the
 * NDA constraint is actually enforced rather than merely intended:
 * Zod strips every key it does not name, so a client that sends `content` or
 * `text` alongside a path cannot get it as far as Prisma. Read the field list
 * below as the complete inventory of what leaves the browser.
 *
 * The value shapes matter as much as the field names. A ledger row is a stored
 * instruction to re-fetch something later, so owner, name and SHA are held to
 * the same rules the GitHub routes apply before interpolating them into an API
 * path — an unchecked value here would be a path traversal with a delay fuse.
 */

import { z } from "zod"

import { isValidOwner, isValidRepoName } from "../github/repo-id"

/** Git object names are hex: 40 characters today, 64 in a sha256 repository. */
const CommitSha = z.string().regex(/^[0-9a-f]{40,64}$/)

/** SHA-256 of the raw bytes, lowercase hex — see lib/uniqueness/hash.ts. */
const ContentHash = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * A repository-relative path. Never absolute, never climbing out: GitHub does
 * not produce either, so one arriving here is a client that was tampered with.
 *
 * Exported because `lib/classifications/payload.ts` guards the app's other
 * write path with the same rule. One definition, deliberately — a security
 * check copied into two files is a security check that drifts.
 */
export const RepoPath = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.split("/").includes("..") &&
      !path.includes("\0"),
    "path must stay inside the repository"
  )

/**
 * A generous ceiling, not a product limit. It exists so a malformed or hostile
 * client cannot turn one request into an unbounded write.
 */
const MAX_FILES = 5000

const ExportedFile = z.object({
  path: RepoPath,
  commitSha: CommitSha,
  contentHash: ContentHash,
  sizeBytes: z.int().min(0),
})

const ExportRequest = z.object({
  repo: z.object({
    owner: z.string().refine(isValidOwner),
    name: z.string().refine(isValidRepoName),
    defaultBranch: z.string().max(255).optional(),
  }),
  /**
   * The page count of the run that produced the downloaded bytes. Never a
   * second render — see `renderPdf` — and never zero, because an export of
   * nothing produced no PDF to record.
   */
  actualPages: z.int().min(1),
  files: z.array(ExportedFile).min(1).max(MAX_FILES),
})

export type ExportRequest = z.infer<typeof ExportRequest>

export type ParseResult =
  | { ok: true; value: ExportRequest }
  | { ok: false; error: string }

/**
 * `ok`/`error` rather than a throw: the caller is a route handler that owes
 * the browser a 400, and Zod's own message is not something to hand back
 * verbatim.
 */
export function parseExportRequest(payload: unknown): ParseResult {
  const parsed = ExportRequest.safeParse(payload)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      ok: false,
      error: first
        ? `Invalid export payload at ${first.path.join(".") || "(root)"}.`
        : "Invalid export payload.",
    }
  }
  return { ok: true, value: parsed.data }
}
