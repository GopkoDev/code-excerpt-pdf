/**
 * Everything the app persists about an export, behind one narrow port.
 *
 * The port is the point. The Prisma client is passed in rather than imported,
 * so these rules — a repo row is reused, one `UsedFile` per file, the ledger
 * never crosses users — can be proven against an in-memory fake in
 * `exports.test.ts` without a database. It also keeps the surface small enough
 * to read: if a field that could carry source code ever appears here, it is
 * visible in one file.
 *
 * The hard constraint, restated because this is where it would be broken:
 * **no source code and no PDFs are ever stored.** Paths, SHAs, content hashes
 * and sizes only.
 */

import type { UsedFileRecord } from "../uniqueness/status"

export type ExportedFile = {
  path: string
  /**
   * The SHA the listing was pinned to — see `lib/github/tree.ts`. Re-fetching
   * a past export resolves the tree at this SHA rather than at HEAD.
   */
  commitSha: string
  /** SHA-256 of the RAW bytes, before any whitespace normalization. */
  contentHash: string
  sizeBytes: number
}

export type RepoRef = {
  owner: string
  name: string
  /**
   * Decorative, and therefore optional.
   *
   * Regeneration re-fetches by the pinned `commitSha`, never by branch, so the
   * branch name is never load-bearing — and the repository page reaches a repo
   * through `owner/name` in the URL without ever learning it. Requiring it
   * would have meant one `GET /repos/{owner}/{repo}` per export purely to fill
   * a display field.
   */
  defaultBranch?: string
}

export type RecordExportInput = {
  userId: string
  repo: RepoRef
  /** The page count of the run that produced the bytes — never a second run. */
  actualPages: number
  files: ExportedFile[]
}

export type RecordedExport = {
  id: string
  createdAt: Date
  actualPages: number
  fileCount: number
}

export type ExportSummary = {
  id: string
  createdAt: Date
  actualPages: number
  repo: RepoRef | null
  files: ExportedFile[]
}

/**
 * The slice of the Prisma client this module uses.
 *
 * Written by hand rather than derived from `PrismaClient`, so a fake can
 * implement it in a few lines. Structurally satisfied by the real client.
 */
export type ExportsDb = {
  user: {
    upsert(args: {
      where: { githubId: string }
      create: { githubId: string; login: string }
      update: { login: string }
    }): Promise<{ id: string }>
    findUnique(args: {
      where: { githubId: string }
    }): Promise<{ id: string } | null>
  }
  repo: {
    upsert(args: {
      where: {
        userId_owner_name: { userId: string; owner: string; name: string }
      }
      create: {
        userId: string
        owner: string
        name: string
        defaultBranch?: string
      }
      update: { defaultBranch?: string }
    }): Promise<{ id: string }>
  }
  export: {
    create(args: {
      data: {
        userId: string
        repoId: string
        actualPages: number
        // `repoId` is repeated on every row rather than inherited from the
        // parent: `UsedFile.repo` is a required relation of its own, and the
        // ledger is read per repository without joining through `Export`.
        usedFiles: { create: (ExportedFile & { repoId: string })[] }
      }
    }): Promise<{ id: string; createdAt: Date }>
    findMany(args: {
      where: { userId: string }
      orderBy: { createdAt: "desc" }
      include: { repo: true; usedFiles: true }
    }): Promise<
      {
        id: string
        actualPages: number
        createdAt: Date
        repo: {
          owner: string
          name: string
          defaultBranch: string | null
        } | null
        usedFiles: ExportedFile[]
      }[]
    >
  }
  usedFile: {
    findMany(args: {
      where: { repo: { userId: string; owner: string; name: string } }
    }): Promise<ExportedFile[]>
  }
}

/**
 * The `User` row, created on sign-in and refreshed on every export.
 *
 * There is no `@auth/prisma-adapter` — it declares no Prisma 7 support, and
 * the JWT session strategy needs none. This is the whole of what the adapter
 * would have done for us.
 */
export async function upsertUser(
  db: ExportsDb,
  { githubId, login }: { githubId: string; login: string }
): Promise<{ id: string }> {
  return db.user.upsert({
    where: { githubId },
    create: { githubId, login },
    // A GitHub login can be renamed; the numeric id cannot. Following the
    // rename keeps the history page from naming the wrong account.
    update: { login },
  })
}

export async function findUser(
  db: ExportsDb,
  githubId: string
): Promise<{ id: string } | null> {
  return db.user.findUnique({ where: { githubId } })
}

/**
 * Records one export: an `Export` row plus one `UsedFile` per file.
 *
 * Written as a single nested create, so an export can never end up half
 * recorded — a partially written ledger would either lock files out that were
 * never filed or let filed ones back in.
 */
export async function recordExport(
  db: ExportsDb,
  { userId, repo, actualPages, files }: RecordExportInput
): Promise<RecordedExport> {
  // The payload arrives over the network, so a repeated path is possible even
  // though the selection is a Set. Two rows for one file would double it in
  // the per-project stats; the last one wins, matching `resolveStatuses`.
  const byPath = new Map<string, ExportedFile>()
  for (const file of files) byPath.set(file.path, file)
  const unique = [...byPath.values()]

  if (unique.length === 0) {
    // An export of nothing produced no PDF; a row for it could never be
    // re-downloaded and would sit in the history as a puzzle.
    throw new Error("Refusing to record an export with no files.")
  }

  const repoRow = await db.repo.upsert({
    where: {
      userId_owner_name: { userId, owner: repo.owner, name: repo.name },
    },
    create: { userId, ...repo },
    update: { defaultBranch: repo.defaultBranch },
  })

  const created = await db.export.create({
    data: {
      userId,
      repoId: repoRow.id,
      actualPages,
      usedFiles: {
        create: unique.map((file) => ({ ...file, repoId: repoRow.id })),
      },
    },
  })

  return {
    id: created.id,
    createdAt: created.createdAt,
    actualPages,
    fileCount: unique.length,
  }
}

/** The history page: newest first, with everything needed to re-download. */
export async function listExports(
  db: ExportsDb,
  userId: string
): Promise<ExportSummary[]> {
  const rows = await db.export.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { repo: true, usedFiles: true },
  })

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    actualPages: row.actualPages,
    repo: row.repo
      ? {
          owner: row.repo.owner,
          name: row.repo.name,
          defaultBranch: row.repo.defaultBranch ?? undefined,
        }
      : null,
    files: row.usedFiles.map(toRecord),
  }))
}

/**
 * The ledger for one repository — what `resolveStatuses` needs to mark a
 * listing.
 *
 * Scoped through the repo's `userId`, not just by owner and name: two users
 * may both have exported from the same public repository, and one must never
 * see the other's history reflected in their tree.
 */
export async function listUsedFiles(
  db: ExportsDb,
  { userId, owner, name }: { userId: string; owner: string; name: string }
): Promise<UsedFileRecord[]> {
  const rows = await db.usedFile.findMany({
    where: { repo: { userId, owner, name } },
  })
  return rows.map(toRecord)
}

const toRecord = (file: ExportedFile): UsedFileRecord => ({
  path: file.path,
  commitSha: file.commitSha,
  contentHash: file.contentHash,
  sizeBytes: file.sizeBytes,
})
