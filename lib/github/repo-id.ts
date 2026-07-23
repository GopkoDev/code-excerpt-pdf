/**
 * The `[repoId]` route segment: a repository identified without persistence.
 *
 * Slice 6 introduces a `Repo` row, but until then the URL has to carry the
 * owner and the name itself. A slash cannot: Next would read it as two
 * segments, and percent-encoding it is normalised away by proxies. So the two
 * halves are joined by an underscore, which is unambiguous because a GitHub
 * login may only contain alphanumerics and hyphens — the first underscore is
 * always the separator, even though repository names may contain more.
 *
 * Both halves are validated on the way back out. They are interpolated into a
 * GitHub API path, and anything containing `/` or `..` could address an
 * endpoint other than the repository the user asked for.
 */

/** Logins: alphanumerics and single hyphens, never leading or trailing. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/

/** Repository names additionally allow `.` and `_`, but are never only dots. */
const REPO = /^[A-Za-z0-9._-]+$/

export type RepoIdParts = { owner: string; repo: string }

export function isValidOwner(owner: string): boolean {
  return OWNER.test(owner)
}

export function isValidRepoName(repo: string): boolean {
  return REPO.test(repo) && !/^\.+$/.test(repo)
}

export function encodeRepoId(owner: string, repo: string): string {
  return `${owner}_${repo}`
}

/** `null` — never a throw — so a bad URL renders "not found", not a 500. */
export function parseRepoId(repoId: string): RepoIdParts | null {
  const separator = repoId.indexOf("_")
  if (separator <= 0) return null

  const owner = repoId.slice(0, separator)
  const repo = repoId.slice(separator + 1)
  if (!isValidOwner(owner) || !isValidRepoName(repo)) return null

  return { owner, repo }
}
