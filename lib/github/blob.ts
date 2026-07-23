/**
 * Fetching a single file's content.
 *
 * Content is pulled lazily, for selected files only — SPEC's rule, and the
 * reason the tree view runs on size estimates. Bytes are returned raw, never
 * decoded to text here: the content hash is taken over exactly these bytes,
 * before any normalization.
 */

import { z } from "zod"

const BlobResponse = z.object({
  content: z.string(),
  encoding: z.string(),
  size: z.number().optional(),
  sha: z.string().optional(),
})

export function decodeBlobResponse(payload: unknown): Uint8Array {
  const parsed = BlobResponse.parse(payload)

  if (parsed.encoding !== "base64") {
    // Blobs over 1 MB come back as encoding "none" with empty content.
    // Returning an empty array would export a blank page and look like the
    // file was simply short.
    throw new Error(
      `GitHub returned encoding "${parsed.encoding}" — the file is probably too large to inline.`
    )
  }

  // GitHub wraps its base64 at 60 columns; the newlines are not content.
  const compact = parsed.content.replace(/\s+/g, "")
  if (compact === "") return new Uint8Array()

  const binary = atob(compact)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
