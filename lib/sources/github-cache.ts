/**
 * One `ContentSource` per repository, for as long as the tab lives.
 *
 * `createGitHubSource` caches its Trees call and its blobs per instance, which
 * covers a single visit. SPEC asks for more: navigating away from a repo and
 * back within the session must issue **zero** further GitHub calls — and
 * navigating remounts the page component, which would build a second source
 * and repeat the Trees call. Holding the instances in module scope is what
 * makes the caching survive that.
 *
 * Module scope, not React state or a query cache: the source *is* the cache,
 * so wrapping it in another one would only add a second place for the truth to
 * live.
 */

import { createGitHubSource, type RepoRef } from "./github"

type Source = ReturnType<typeof createGitHubSource>

const sources = new Map<string, Source>()

const keyFor = ({ owner, repo, ref }: RepoRef) =>
  `${owner}/${repo}@${ref ?? "HEAD"}`

export function getGitHubSource(
  ref: RepoRef,
  options: { fetcher?: typeof fetch } = {}
): Source {
  const key = keyFor(ref)
  const existing = sources.get(key)
  if (existing) return existing

  const created = createGitHubSource(ref, options)
  sources.set(key, created)
  return created
}

/** Tests only — module state would otherwise leak between cases. */
export function clearGitHubSources(): void {
  sources.clear()
}
