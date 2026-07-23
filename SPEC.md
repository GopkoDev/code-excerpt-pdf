# SPEC — code-excerpt-pdf

Derived from the confirmed intent and `docs/ideas/code-excerpt-pdf.md`. Where this file and that
one disagree, this file wins for _how_ we build; the idea doc holds the _why_.

---

## 1. Objective

A web app that turns the recurring prep of a "proof-of-authorship" code PDF into a few minutes
of work.

The user browses a GitHub repository as a file tree where every file carries an estimated page
count and a status marker, **manually picks whole files among the unused ones**, watches a
**running page count accumulate**, and exports a paginated, print-ready PDF. Every exported file
is recorded so it can never appear in a future listing.

**Users:** the author (primary), plus anyone with the same problem via a **public instance**
(link in the repo description) or self-hosting.

**Success:** filing prep takes minutes; zero doubt about "did I already submit this?"; zero
generate → too-few-pages → regenerate cycles.

**Hard constraint:** **no source code is ever stored.** This is an NDA requirement and it
dictates the architecture — commit SHAs and content hashes instead of content.

**Explicitly not the app's job:** knowing tax rules. The app counts pages; the user decides how
many are needed. No target input, no threshold validation, no payout arithmetic.

---

## 2. Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build — also runs full TypeScript check
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (flat config, eslint-config-next)
npm run format       # prettier --write on all .ts/.tsx

npm run test         # vitest run
npm run test:watch   # vitest

npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma generate                    # regenerate client
npx prisma studio                      # inspect data locally
```

---

## 3. Project Structure

```
app/
  (marketing)/          landing, terms, privacy            — public, no auth
  (app)/
    projects/           repo list + install/refresh entry
    projects/[repoId]/  file tree, selection, running page count, export
    exports/            past exports, re-download
    settings/           repo access, GDPR export + account deletion
  api/
    auth/[...nextauth]/ Auth.js → GitHub App
    github/tree/        1 recursive Trees call, cache-aware
    github/blob/        lazy per-file content fetch
    exports/            create export, list, regenerate

components/
  ui/                   shadcn — added via CLI, never hand-written
  tree/                 tree view, tri-state checkbox, status markers, toolbar
  pdf/                  client-side pdfkit renderer + download

lib/
  github/               Trees/blobs client, concurrency limit, error mapping
  pdf/                  page estimation + document generation (shared logic)
  vendored/             layered detection (manual → gitattributes → plugin → structural)
  uniqueness/           hashing, used / used-but-changed resolution
  db/                   Prisma client singleton

prisma/schema.prisma
docs/ideas/, docs/intent/
```

### Data model (no code, no PDFs — metadata and hashes only)

| Model            | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `User`           | Auth.js identity                                                        |
| `Repo`           | `githubRepoId`, `owner`, `name`, `defaultBranch`                        |
| `Export`         | `actualPages`, `createdAt` — **no threshold, no payout**                |
| `UsedFile`       | `repoId`, `path`, `commitSha`, `contentHash`, `sizeBytes`, `exportId`   |
| `Classification` | `repoId`, `pathOrGlob`, `kind: VENDORED \| AUTHORED` — manual overrides |
| `TreeCache`      | `repoId`, `headSha`, `tree` (Json: path/size/blobSha/type), `fetchedAt` |

`UsedFile` carries `sizeBytes` so per-project stats (% of volume consumed) never require an
extra GitHub call.

### Technical constraints to honor

- **Prisma on serverless** — use Neon's **pooled** connection string (or the Neon driver
  adapter) and a single client instance per lambda; an unpooled client will exhaust connections.
- **pdfkit browser build** — chosen so the output matches `generate.js` exactly (same library,
  same API). **Lazy-load it** via dynamic import; the bundle is ~1 MB and must not enter the
  initial payload. Only standard fonts (`Courier`, `Helvetica-Bold`) are used, so no font
  embedding is required.
- **GitHub reads** — one `recursive=1` Trees call per repo (cached); file content fetched lazily
  for selected files only, concurrency 3–5 to avoid secondary rate limits.

---

## 4. Code Style

Inherited from `CLAUDE.md` and enforced by tooling — match it, don't relitigate it.

- **Prettier** (auto-runs on write): no semicolons, double quotes, 2-space, `printWidth` 80,
  `trailingComma: es5`, `prettier-plugin-tailwindcss` sorts classes.
- **Next.js 16 + React 19** — read the relevant guide in `node_modules/next/dist/docs/` before
  writing Next-specific code. Do not assume App Router conventions from memory.
- **shadcn on `@base-ui/react`, not Radix.** Custom triggers use the **`render` prop, never
  `asChild`**. Add components with `npx shadcn@latest add <component>` — never hand-write them.
- **Tailwind v4**, configured in `app/globals.css`. Semantic tokens only (`bg-primary`,
  `text-muted-foreground`) — no raw colors, no manual `dark:` overrides. Use `cn()` from
  `@/lib/utils`.
- Path alias `@/*` → repo root.
- Dialogue with the user is Ukrainian; **all code, comments, identifiers, and files are
  English.**

---

## 5. Testing Strategy

**Vitest only.** No browser/e2e runner in the MVP.

Test the logic where a mistake costs money or credibility:

- **Page estimation** — byte-size estimate vs actual rendered page count stays within tolerance;
  the running total converges to what the PDF really produces.
- **Uniqueness** — `contentHash` computation; `used` vs `used-but-changed` resolution (same
  path + new hash); a used file never silently re-enters a listing.
- **Vendored detection** — layer precedence (manual override beats `.gitattributes` beats
  ecosystem plugin beats structural list), folder-rule cascade to descendants including new
  files, most-specific-rule-wins (file beats folder).
- **Bulk select** — folder-add skips used and vendored files and reports accurate counts.
- **Tree cache** — invalidation keyed on `{repoId}@{headSha}`; a matching key performs no Trees
  call.
- **PDF generation** — deterministic page count for a fixed input fixture.

**Accepted risk:** without e2e, the OAuth/installation round-trip and the download path are
verified manually. Revisit if that flow starts breaking.

---

## 6. Boundaries

### Always

- Store **only** metadata and hashes. Never source code, never generated PDFs.
- Authenticate via **GitHub App** with `Contents: Read-only` and per-repo installation.
- Keep GitHub tokens in the Auth.js encrypted session cookie — **never** persist a long-lived
  token in the database.
- One `recursive=1` Trees call per repo; content fetched lazily for selected files only.
- Let the user override any automatic classification, at file **or folder** level.
- Update `.claude/ARCHITECTURE.md` in the **same commit** whenever files are added, removed,
  moved, or repurposed.

### Ask first

- Any new persisted field that could carry code, secrets, or unexpectedly sensitive metadata.
- Changing the PDF layout — `generate.js` is the visual reference and the output must keep
  matching it.
- New dependencies with meaningful bundle cost, or any third-party service.
- Anything that transmits user data off the instance (analytics, error reporting with payloads).

### Never

- Request `scope: "repo"`, or use a classic OAuth App — it grants read **and write** to every
  private repository.
- Log or store decrypted tokens.
- Compute a page target from a payout amount, or encode any tax rule.
- Auto-select files to fill a volume — selection is manual.
- Dedup at line or fragment level — uniqueness is per file.
- Hard-block adding a vendored file — warn, then let the user decide.

---

## Acceptance Criteria

- [ ] Signing in via the GitHub App grants access to **only** the repos the user selected; the
      settings page links to GitHub to change that selection.
- [ ] A user authenticated but with no installation is detected and routed to the install URL.
- [ ] Opening a repo issues **one** Trees call; navigating away and back within the session
      issues **zero** further GitHub calls.
- [ ] Every file in the tree shows an estimated page count and one of: available, `used`,
      `used-but-changed`, `vendored`.
- [ ] Selecting files updates a running page total; there is **no** target field anywhere.
- [ ] Selecting a folder adds only available files and reports "added N, skipped X used, Y
      vendored".
- [ ] A file marked vendored by the parser can be unmarked by the user, and the override
      survives a content change and a cache refresh.
- [ ] Exporting produces a PDF visually matching `generate.js` and records every included file.
- [ ] An exported file cannot be silently included again — reselecting it warns.
- [ ] A past export re-downloads by re-fetching pinned commit SHAs; if a repo or commit is gone
      it shows `source-gone` and points to the emailed copy rather than failing obscurely.
- [ ] Settings exports all user data and deletes the account with its data.
- [ ] Anonymous mode generates a PDF from uploaded files with nothing persisted.
- [ ] A database dump contains no source code and no usable GitHub credential.
