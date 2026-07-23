/**
 * A deliberately small path matcher, covering the subset of gitignore syntax
 * the vendored layers actually use.
 *
 * Not a general glob implementation, and not trying to be: pulling in a full
 * matcher would add a dependency for rules that are, in practice, folder
 * names, folder prefixes and a handful of `*.ext` patterns. The supported
 * subset is exactly what `glob.test.ts` pins.
 *
 * Supported:
 *   `node_modules`     bare name — matches that segment at any depth
 *   `/dist`            rooted — only at the top level
 *   `dist/`            folder — matches anything inside it
 *   `components/ui`    path prefix — that folder and its descendants
 *   `*.min.js`         `*` matches within one segment
 *   `src/**`           `**` matches across segments
 */

function normalize(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/")
}

function escapeLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Translates one pattern segment into a regex source fragment. */
function segmentToRegex(segment: string): string {
  return segment.split("*").map(escapeLiteral).join("[^/]*")
}

export function matchesGlob(path: string, pattern: string): boolean {
  const target = normalize(path)
  if (pattern === "" || target === "") return false

  const rooted = pattern.startsWith("/")
  const folderOnly = pattern.endsWith("/")
  const cleaned = normalize(pattern)
  if (cleaned === "") return false

  const segments = cleaned.split("/")

  // A pattern with no slash matches at any depth — the gitignore rule that
  // makes both `node_modules` and `*.min.js` work without a path.
  if (!rooted && segments.length === 1) {
    const segment = new RegExp(`^${segmentToRegex(segments[0])}$`)
    const hit = target.split("/").some((part) => segment.test(part))
    // `dist/` must match something inside dist, not the entry itself.
    return folderOnly ? hit && target !== cleaned : hit
  }

  const body = segments
    .map((segment) => (segment === "**" ? "(?:.+)" : segmentToRegex(segment)))
    .join("/")

  // Any pattern also matches everything beneath it, so a folder rule covers
  // its descendants — including files added later.
  const source = `^${body}(?:/.*)?$`
  const matchesFromRoot = new RegExp(source).test(target)

  if (folderOnly) {
    // `dist/` must match something *inside* dist, not the entry itself.
    return matchesFromRoot && target !== cleaned
  }

  return matchesFromRoot
}
