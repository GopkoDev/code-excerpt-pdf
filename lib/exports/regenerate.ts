/**
 * Rebuilding a past export from the revisions it was pinned to.
 *
 * This is what "no source code is ever stored" costs, and why the cost is
 * affordable: the ledger keeps a path, a commit SHA and a content hash per
 * file, and that is enough to fetch exactly the bytes that were filed. The
 * repository is re-listed **at the pinned SHA**, never at HEAD — re-listing at
 * HEAD would quietly rebuild a different document under the same date.
 *
 * Nothing here is a gate. A file that has since been deleted, a revision that
 * no longer resolves, a file whose content moved on — each is reported and the
 * rest is still rebuilt, because a user re-downloading a filed listing needs
 * the closest thing that still exists far more than they need a refusal.
 */

import { mapWithConcurrency } from "../github/concurrency"
import type { ParsedTree } from "../github/tree"
import { sha256Hex } from "../uniqueness/hash"

export type PinnedFile = {
  path: string
  /** The revision the export was taken at. Re-listing happens here, not HEAD. */
  commitSha: string
  /** SHA-256 of the raw bytes as filed. Compared, never enforced. */
  contentHash: string
}

export type RefetchedFile = {
  path: string
  /** Basename — what the PDF prints as the title, exactly as at export time. */
  name: string
  bytes: Uint8Array
}

export type RegenerateResult =
  | {
      kind: "ok"
      files: RefetchedFile[]
      /** Paths whose bytes no longer hash to what was filed. Informational. */
      changed: string[]
      /** Files GitHub no longer serves at their pinned revision. */
      missing: PinnedFile[]
    }
  | {
      kind: "source-gone"
      /** Safe to show: it comes from our own route, never from GitHub raw. */
      reason: string
    }

export type RepoRef = { owner: string; name: string }

/** SPEC caps content fetches to avoid GitHub's secondary rate limits. */
const BLOB_CONCURRENCY = 4

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Re-fetches every file of a past export at the revision it was pinned to.
 *
 * One Trees call per **distinct** commit SHA — an export taken in one sitting
 * is a single call — then one blob per file.
 */
export async function collectPinnedFiles(
  repo: RepoRef,
  pinned: PinnedFile[],
  options: { fetcher?: Fetcher } = {}
): Promise<RegenerateResult> {
  const request = options.fetcher ?? fetch
  if (pinned.length === 0) {
    return { kind: "ok", files: [], changed: [], missing: [] }
  }

  const shas = [...new Set(pinned.map((file) => file.commitSha))]

  /** path → blob SHA, for each revision that still resolves. */
  const trees = new Map<string, Map<string, string>>()
  for (const sha of shas) {
    const params = new URLSearchParams({
      owner: repo.owner,
      repo: repo.name,
      ref: sha,
    })
    const response = await request(`/api/github/tree?${params}`)

    if (response.status === 404) continue
    if (!response.ok) {
      // A rate limit, a revoked grant or an outage must stay distinguishable
      // from a deleted repository: "the source is gone" is a permanent verdict
      // and would send the user to their email for something that will work
      // again in a minute.
      throw new Error(
        await readError(response, "Could not re-read this repository.")
      )
    }

    const body = (await response.json()) as ParsedTree
    trees.set(sha, new Map(body.files.map((file) => [file.path, file.blobSha])))
  }

  if (trees.size === 0) {
    return {
      kind: "source-gone",
      reason:
        "GitHub no longer serves the revision this export was taken from — the repository may have been deleted, renamed, or had its access revoked.",
    }
  }

  const fetched = await mapWithConcurrency(
    pinned,
    async (file): Promise<RefetchedFile | null> => {
      const blobSha = trees.get(file.commitSha)?.get(file.path)
      if (!blobSha) return null

      const params = new URLSearchParams({
        owner: repo.owner,
        repo: repo.name,
        sha: blobSha,
      })
      const response = await request(`/api/github/blob?${params}`)
      if (response.status === 404) return null
      if (!response.ok) {
        throw new Error(
          await readError(response, `Could not read ${file.path}.`)
        )
      }

      const body = (await response.json()) as { base64?: string }
      if (body.base64 === undefined) return null

      return {
        path: file.path,
        name: file.path.split("/").pop() ?? file.path,
        bytes: decodeBase64(body.base64),
      }
    },
    BLOB_CONCURRENCY
  )

  const files: RefetchedFile[] = []
  const missing: PinnedFile[] = []
  const changed: string[] = []

  for (const [index, file] of fetched.entries()) {
    if (!file) {
      missing.push(pinned[index])
      continue
    }
    files.push(file)
    // Reported, never enforced. A blob SHA addresses immutable content, so a
    // mismatch means the ledger and the repository disagree — worth saying out
    // loud, but not worth withholding the document over.
    if ((await sha256Hex(file.bytes)) !== pinned[index].contentHash) {
      changed.push(file.path)
    }
  }

  return { kind: "ok", files, changed, missing }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
