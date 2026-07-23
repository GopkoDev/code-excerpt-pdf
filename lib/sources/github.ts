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
): ContentSource & { isTruncated: () => boolean } {
  const request = options.fetcher ?? fetch

  // One Trees call per repo, held for the session: SPEC requires that
  // navigating away and back issues zero further calls.
  let treePromise: Promise<ParsedTree> | null = null
  const blobShas = new Map<string, string>()
  const contents = new Map<string, Uint8Array>()
  let truncated = false

  async function loadTree(): Promise<ParsedTree> {
    if (treePromise) return treePromise

    treePromise = (async () => {
      const params = new URLSearchParams({ owner, repo })
      if (ref) params.set("ref", ref)

      const response = await request(`/api/github/tree?${params}`)
      const body = (await response.json()) as ParsedTree & { error?: string }
      if (!response.ok) {
        throw new Error(body.error ?? "Could not read the repository tree.")
      }

      truncated = body.truncated
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
  }
}
