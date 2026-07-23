/**
 * Manual vendored/authored overrides, made durable — behind one narrow port.
 *
 * Slice 3 kept overrides in React state, so un-marking a file lasted until the
 * next reload. This is the same decision written down, and the port shape is
 * the same as `exports.ts`: the Prisma client is a parameter, so the rules
 * (an override is updated rather than duplicated, a folder rule keeps its
 * cascade, one user never sees another's) are provable with no database.
 *
 * **A new NDA surface.** This table stores paths and globs the user wrote —
 * which do describe a repository's shape — and nothing else. No content, no
 * sizes, no hashes. That absence is load-bearing rather than incidental: an
 * override keyed on a content hash would be silently discarded the moment the
 * file changed, which is precisely what SPEC requires it to survive.
 *
 * ### Why there is no `scope` column
 *
 * `ManualOverride` distinguishes a file rule from a folder rule, and SPEC §3
 * gives `Classification` three fields — `repoId`, `pathOrGlob`, `kind`. Both
 * hold, because `pathOrGlob` is a glob: a folder rule is written with a
 * trailing slash (`components/ui/`), which is the gitignore convention
 * `lib/vendored/glob.ts` already implements, and a file rule is the bare path.
 * The encoding is lossless and the resolver is untouched.
 */

import type { ExportsDb, RepoRef, UsersDb } from "./exports"
import type { ManualOverride } from "../vendored/types"

export type ClassificationKind = "VENDORED" | "AUTHORED"

export type ClassificationRow = {
  pathOrGlob: string
  kind: ClassificationKind
}

/**
 * The slice of the Prisma client this module uses.
 *
 * `UsersDb` and `repo.upsert` are reused from `exports.ts` rather than
 * restated, so the two ports cannot drift on the compound key. `findUnique` is
 * added because *reading* overrides must not create a `Repo` row — opening a
 * repository the user has never exported from is not a reason to write to the
 * database.
 */
export type ClassificationsDb = UsersDb & {
  repo: ExportsDb["repo"] & {
    findUnique(args: {
      where: {
        userId_owner_name: { userId: string; owner: string; name: string }
      }
    }): Promise<{ id: string } | null>
  }
  classification: {
    findMany(args: {
      where: { repoId: string }
    }): Promise<ClassificationRow[]>
    upsert(args: {
      where: {
        repoId_pathOrGlob: { repoId: string; pathOrGlob: string }
      }
      create: {
        repoId: string
        pathOrGlob: string
        kind: ClassificationKind
      }
      update: { kind: ClassificationKind }
    }): Promise<{ id: string }>
  }
}

/** Trailing and leading slashes are the encoding, so they are never data. */
const trim = (path: string) => path.replace(/^\/+/, "").replace(/\/+$/, "")

export function toPathOrGlob({ path, scope }: ManualOverride): string {
  const cleaned = trim(path)
  return scope === "folder" ? `${cleaned}/` : cleaned
}

export function toOverride({
  pathOrGlob,
  kind,
}: ClassificationRow): ManualOverride {
  return {
    path: trim(pathOrGlob),
    scope: pathOrGlob.endsWith("/") ? "folder" : "file",
    vendored: kind === "VENDORED",
  }
}

/**
 * Every override for one repository of one user, in the shape the precedence
 * resolver takes.
 *
 * Scoped through the repo's `userId` for the same reason `listUsedFiles` is:
 * two users may both hold the same public repository, and one must never see
 * the other's decisions reflected in their tree.
 */
export async function listOverrides(
  db: ClassificationsDb,
  { userId, owner, name }: { userId: string; owner: string; name: string }
): Promise<ManualOverride[]> {
  const repo = await db.repo.findUnique({
    where: { userId_owner_name: { userId, owner, name } },
  })
  // Nothing has ever been exported or overridden here. An empty list, not an
  // error: every file is simply still classified automatically.
  if (!repo) return []

  const rows = await db.classification.findMany({ where: { repoId: repo.id } })
  return rows.map(toOverride)
}

/**
 * Records one override, creating the `Repo` row if this is the first thing the
 * user has ever done with the repository.
 *
 * An upsert rather than an insert: re-marking a path must move the existing
 * rule, not stack a second one the resolver would have to break a tie between.
 */
export async function saveOverride(
  db: ClassificationsDb,
  {
    userId,
    repo,
    override,
  }: { userId: string; repo: RepoRef; override: ManualOverride }
): Promise<void> {
  const repoRow = await db.repo.upsert({
    where: {
      userId_owner_name: { userId, owner: repo.owner, name: repo.name },
    },
    create: { userId, ...repo },
    update: { defaultBranch: repo.defaultBranch },
  })

  const pathOrGlob = toPathOrGlob(override)
  const kind: ClassificationKind = override.vendored ? "VENDORED" : "AUTHORED"

  await db.classification.upsert({
    where: { repoId_pathOrGlob: { repoId: repoRow.id, pathOrGlob } },
    create: { repoId: repoRow.id, pathOrGlob, kind },
    update: { kind },
  })
}
