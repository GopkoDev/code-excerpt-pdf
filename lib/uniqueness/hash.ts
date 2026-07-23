/**
 * Content hashing for the uniqueness ledger.
 *
 * SPEC's hard constraint is that no source code is ever stored — only commit
 * SHAs and content hashes. This is the hash.
 */

/**
 * SHA-256 of raw file bytes, lowercase hex.
 *
 * **Always hash the raw bytes, before `normalizeCode`.** The renderer turns
 * tabs into two spaces and collapses CRLF; hashing the transformed text would
 * tie every stored hash to the current whitespace rules, so any future tweak
 * would invalidate the whole ledger and let already-exported files re-enter a
 * listing.
 *
 * Uses `crypto.subtle`, which behaves identically in the browser, the Web
 * Worker, and Node — so a hash computed at export time matches one recomputed
 * anywhere else.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
