import type { AccountModel } from "@/lib/db/account"

/**
 * The inventory the privacy notice renders — one entry per persisted model.
 *
 * Separated from the page so it can be checked rather than believed.
 * Record<AccountModel, …> makes a seventh model a *compile* error here, the
 * same guard AccountDeletion uses in lib/db/account.ts, and
 * app/(marketing)/marketing.test.ts compares every fields list against the
 * columns prisma/schema.prisma actually declares — so a column can neither
 * appear in the database without appearing on this page, nor be listed here
 * after it has been dropped.
 *
 * Read written as the answer to the question a privacy notice exists to
 * answer: not "what could be stored" but "what makes a row appear".
 */
export type StoredCategory = {
  /** Plain-English name for the table. */
  title: string
  /** The columns, verbatim from the schema. */
  fields: string[]
  /** What causes a row to be written. */
  written: string
  /** Why the service keeps it at all, and what the values mean. */
  why: string
}

export const STORED_DATA: Record<AccountModel, StoredCategory> = {
  User: {
    title: "Your account",
    fields: ["id", "githubId", "login", "createdAt"],
    written: "The first time you sign in with GitHub.",
    why:
      "It is the identity everything else hangs off. login is your GitHub " +
      "username and githubId the numeric account id GitHub issues — both " +
      "are public information on GitHub. No email address is stored, and no " +
      "password exists to store.",
  },
  Repo: {
    title: "Repositories you opened",
    fields: ["id", "userId", "owner", "name", "defaultBranch", "createdAt"],
    written:
      "When you open a repository — not only when you export from one. " +
      "Opening it caches its file listing, and that cache row needs this one, " +
      "so the service does record which repositories you looked at.",
    why:
      "It links a repository to your account, so the export ledger, your " +
      "manual overrides and the cached listing can be found again. Only the " +
      "owner and the repository name are kept, never a description or a URL.",
  },
  Export: {
    title: "Exports you produced",
    fields: ["id", "userId", "repoId", "actualPages", "createdAt"],
    written:
      "After a PDF has finished downloading — never before. Recording it " +
      "first would lock files out of every future listing for a document " +
      "nobody actually has.",
    why:
      "So the exports page can list what you have already produced and " +
      "rebuild it later. actualPages is the page count of the very render " +
      "that produced your file. The PDF itself is not kept.",
  },
  UsedFile: {
    title: "The uniqueness ledger",
    fields: [
      "id",
      "repoId",
      "exportId",
      "path",
      "commitSha",
      "contentHash",
      "sizeBytes",
      "createdAt",
    ],
    written: "One row per file, when an export is recorded.",
    why:
      "This is the record that stops a file appearing in two documents, and " +
      "it is also what lets a past export be rebuilt without storing it: " +
      "commitSha pins the exact revision to re-fetch from GitHub. " +
      "contentHash is a SHA-256 of the file's bytes — a one-way digest that " +
      "cannot be turned back into the file — and sizeBytes its length. The " +
      "bytes themselves are never written down.",
  },
  Classification: {
    title: "Your manual overrides",
    fields: ["id", "repoId", "pathOrGlob", "kind", "createdAt", "updatedAt"],
    written:
      "When you mark a file or a folder as yours, or as not yours, " +
      "correcting the automatic vendored-code detection.",
    why:
      "So the marking survives a reload instead of dying with the tab. " +
      "pathOrGlob is a path or a folder pattern; kind is either VENDORED " +
      "or AUTHORED. No hash and no size are recorded, which is exactly what " +
      "lets the override survive you editing the file.",
  },
  TreeCache: {
    title: "A cached file listing",
    fields: ["id", "repoId", "headSha", "tree", "fetchedAt"],
    written:
      "When you open a repository and its listing is fetched from GitHub. " +
      "One row per repository, replaced rather than accumulated.",
    why:
      "So a second tab, another device or a restarted server can paint the " +
      "tree without spending another GitHub call. tree holds one entry per " +
      "file — its path, its size in bytes and its Git blob SHA — and nothing " +
      "else; a blob SHA is a pointer, and reading what it points at still " +
      "costs a GitHub call made with your own token. headSha is the commit " +
      "the listing came from. A listing older than fifteen minutes is " +
      "re-fetched rather than served.",
  },
}
