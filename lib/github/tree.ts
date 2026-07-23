/**
 * The repository tree — one `recursive=1` Trees call per repo, per SPEC.
 *
 * This is the first untrusted JSON the app handles, so it is validated rather
 * than cast. GitHub can answer with an HTML error page or a shape that changed
 * between API versions, and a bare cast turns either into a confusing crash
 * somewhere far away from the cause.
 */

import { z } from "zod"

const TreeEntry = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.string(),
  sha: z.string(),
  size: z.number().optional(),
})

const TreeResponse = z.object({
  sha: z.string(),
  truncated: z.boolean(),
  tree: z.array(TreeEntry),
})

export type RepoFile = {
  path: string
  sizeBytes: number
  blobSha: string
}

export type ParsedTree = {
  headSha: string
  /** True when the repo exceeded the Trees API limit. Never hide this. */
  truncated: boolean
  files: RepoFile[]
}

/** Git's file mode for a symlink; its "content" is a path, not source. */
const SYMLINK_MODE = "120000"

export function parseTreeResponse(payload: unknown): ParsedTree {
  const parsed = TreeResponse.parse(payload)

  return {
    headSha: parsed.sha,
    truncated: parsed.truncated,
    files: parsed.tree
      .filter(
        (entry) =>
          // Folders are implied by the paths themselves; submodules (type
          // "commit") and symlinks have no content to fetch.
          entry.type === "blob" && entry.mode !== SYMLINK_MODE
      )
      .map((entry) => ({
        path: entry.path,
        // A missing size is not a reason to drop the file — the estimator
        // simply treats it as empty until the content is fetched.
        sizeBytes: entry.size ?? 0,
        blobSha: entry.sha,
      })),
  }
}
