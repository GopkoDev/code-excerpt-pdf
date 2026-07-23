/**
 * `ContentSource` over a GitHub repository.
 *
 * The second implementation of the seam from `lib/tree/types.ts`, and the
 * reason that seam exists: tree building, selection, estimation and rendering
 * are untouched by which source they are talking to.
 *
 * Every request goes through `app/api/github/*`, never straight to GitHub —
 * SPEC's boundary, and what keeps the token server-side.
 */

import type { ContentSource, FileEntry } from "../tree/types"
import type { ParsedTree } from "../github/tree"

export type RepoRef = { owner: string; repo: string; ref?: string }

export function createGitHubSource(
  { owner, repo, ref }: RepoRef,
  options: { fetcher?: typeof fetch } = {}
): ContentSource & {
  isTruncated: () => boolean
  headSha: () => string | null
  isCached: () => boolean
  refresh: () => void
} {
  const request = options.fetcher ?? fetch

  // One Trees call per repo, held for the session: SPEC requires that
  // navigating away and back issues zero further calls.
  let treePromise: Promise<ParsedTree> | null = null
  const blobShas = new Map<string, string>()
  const contents = new Map<string, Uint8Array>()
  let truncated = false
  let headSha: string | null = null
  let cached = false
  /**
   * Consumed by the next listing and then cleared.
   *
   * Sticky would be worse than useless: every remount would spend a Trees call
   * and the database tier would never pay for itself. Refresh is a one-shot
   * instruction, not a mode.
   */
  let bypassCache = false

  async function loadTree(): Promise<ParsedTree> {
    if (treePromise) return treePromise

    treePromise = (async () => {
      const params = new URLSearchParams({ owner, repo })
      if (ref) params.set("ref", ref)
      if (bypassCache) params.set("refresh", "1")
      bypassCache = false

      const response = await request(`/api/github/tree?${params}`)
      const body = (await response.json()) as ParsedTree & {
        cached?: boolean
        error?: string
      }
      if (!response.ok) {
        throw new Error(body.error ?? "Could not read the repository tree.")
      }

      cached = body.cached === true
      truncated = body.truncated
      headSha = body.headSha
      body.files.forEach((file) => blobShas.set(file.path, file.blobSha))
      return body
    })()

    try {
      return await treePromise
    } catch (error) {
      // Do not cache a failure, or a transient error would make the repo look
      // permanently unreadable for the rest of the session.
      treePromise = null
      throw error
    }
  }

  return {
    async listFiles(): Promise<FileEntry[]> {
      const tree = await loadTree()
      return tree.files.map((file) => ({
        path: file.path,
        name: file.path.split("/").pop() ?? file.path,
        sizeBytes: file.sizeBytes,
        // Uniqueness marks `used` later (slice 6); vendored is layered on in
        // the page. Everything starts selectable.
        status: "available",
      }))
    },

    async readFile(path: string): Promise<Uint8Array> {
      const cached = contents.get(path)
      if (cached) return cached

      await loadTree()
      const sha = blobShas.get(path)
      if (!sha) throw new Error(`No such file in this repository: ${path}`)

      const params = new URLSearchParams({ owner, repo, sha })
      const response = await request(`/api/github/blob?${params}`)
      const body = (await response.json()) as {
        base64?: string
        error?: string
      }
      if (!response.ok || !body.base64) {
        throw new Error(body.error ?? `Could not read ${path}.`)
      }

      const binary = atob(body.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      contents.set(path, bytes)
      return bytes
    },

    /** True when the repo exceeded the Trees API limit. Surface it. */
    isTruncated: () => truncated,

    /**
     * The revision this listing came from, once it has been listed.
     *
     * Recorded against every exported file, so a past export can be rebuilt by
     * re-fetching rather than by storing what it contained. `null` until the
     * tree has loaded — there is no revision to pin before then.
     */
    headSha: () => headSha,

    /**
     * True when this listing came from the database tier rather than GitHub.
     *
     * Surfaced so the page can say so. The second tier is served *without*
     * asking GitHub what the head SHA is now — that is the entire saving — so
     * a listing can legitimately be a few minutes behind, and the honest thing
     * is to admit it next to the Refresh control rather than let the user
     * discover it in an export.
     */
    isCached: () => cached,

    /**
     * Throw away everything held for this repository and re-list from GitHub.
     *
     * Deliberately NOT part of `ContentSource`: anonymous mode has nothing to
     * refresh, and widening the seam that keeps the two modes identical for
     * the benefit of one of them is how they start to drift. It sits beside
     * `isTruncated` and `headSha`, which are GitHub-only for the same reason.
     *
     * Blobs go too. A new head means a path can point at different bytes, and
     * a cached blob under a re-listed tree would export content the listing no
     * longer describes.
     */
    refresh: () => {
      treePromise = null
      blobShas.clear()
      contents.clear()
      bypassCache = true
    },
  }
}
