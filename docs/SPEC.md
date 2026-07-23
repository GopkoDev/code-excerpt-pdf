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
  pdf/                  constants (visual contract), exact measurement, estimation, rendering
  vendored/             layered detection (manual → gitattributes → plugin → structural)
  uniqueness/           hashing, used / used-but-changed resolution
  db/                   Prisma client singleton

public/vendor/          pdfkit.standalone.js, copied by postinstall
prisma/schema.prisma + prisma.config.ts
docs/                   SPEC.md, ideas/, tasks/  — all docs live here, root stays code-only
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

- **Prisma 7 on serverless** — v7 is ESM-only and **driver adapters are mandatory** (`PrismaNeon`);
  there is no plain pooled-string path. `datasource.url` moves to `prisma.config.ts`, and the
  generator needs an explicit `output`. Two connection strings are required: `DATABASE_URL`
  (Neon **pooled**, runtime) and `DIRECT_URL` (unpooled, migrations — the pooler fails on
  advisory locks). One client instance per lambda via a `globalThis` singleton. Do **not** use
  `@auth/prisma-adapter`: it declares no Prisma 7 support, and the JWT session strategy needs no
  adapter at all.
- **pdfkit in a Web Worker** — load `pdfkit.standalone.js` (all node shims and font tables
  inlined, zero deps) from `public/vendor/`, copied there by a `postinstall` script so the
  version stays pinned to `node_modules/pdfkit`. This keeps `next.config.ts` empty — Turbopack is
  the default bundler in Next 16 and supports no webpack plugins, so pdfkit's official webpack
  recipe is unusable. It also keeps ~2.4 MB out of the initial payload and out of Next's build
  graph, and keeps rendering off the main thread.
- **An embedded Unicode monospace font is required** — one family, two weights (regular for code,
  bold for filename titles), subset to keep the payload small. pdfkit's standard fonts are
  WinAnsi-only: any character outside it maps to `.notdef` **and measures 0pt wide**, so a line
  containing Cyrillic renders as garbage _and_ never wraps, producing a wrong page count.
  `generate.js` has this bug today. See §6 for the approved layout exception this creates.
- **Page counting is exact where content is in hand.** `heightOfString(text, { width, lineGap })`
  runs pdfkit's real line wrapper without emitting to the stream and without page-breaking; since
  every code line has a fixed advance, `round(height / lineAdvance)` is an exact integer line
  count. Compute it once per file and cache it in-session next to the `contentHash`; then
  recompute the running total with **pure arithmetic** on every selection change — never
  re-render. The byte-size estimate applies **only** to files whose content has not been fetched
  yet, and must be biased to **over**-estimate, because under-shooting costs the user a
  regenerate cycle. Note for implementers: the line advance includes `lineGap` but the
  page-break check does not — a naive simulator is off by a page.
- **GitHub reads** — one `recursive=1` Trees call per repo (cached); file content fetched lazily
  for selected files only, concurrency 3–5 to avoid secondary rate limits.
- **`generate.js` cannot currently run** — `package.json` sets `"type": "module"`, so `require`
  throws. It must be renamed to `generate.cjs` before it can serve as a reference at all.

---

## 4. Code Style

Inherited from `CLAUDE.md` and enforced by tooling — match it, don't relitigate it.

- **Prettier** (auto-runs on write): no semicolons, double quotes, 2-space, `printWidth` 80,
  `trailingComma: es5`, `prettier-plugin-tailwindcss` sorts classes.
- **Next.js 16 + React 19** — read the relevant guide in `node_modules/next/dist/docs/` before
  writing Next-specific code. Do not assume App Router conventions from memory. Two Next 16
  specifics that invalidate older guidance: middleware is now **`proxy.ts`** and defaults to the
  **Node** runtime (so the usual "Auth.js is edge-incompatible" workarounds are unnecessary), and
  **Turbopack is the default bundler for `build` as well as `dev`**, with no webpack-plugin
  support.
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

- **Exact line counting** — `round(heightOfString(...) / lineAdvance)` is an integer across a
  corpus of real files: lines over the wrap width, a single 5,000-char minified line, CRLF
  endings, tabs, a missing trailing newline, and **non-ASCII content**.
- **Pagination** — the arithmetic paginator's predicted page count equals
  `doc.bufferedPageRange().count` for a large multi-file selection. This is the test that catches
  the `lineGap`-vs-page-break asymmetry.
- **Byte-size estimate** (unfetched files only) — stays within tolerance of the exact count and
  **never under-estimates** by more than one page.
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
- Call GitHub **only** from `app/api/github/*` — never from a Server Component. Token refresh
  lives in exactly one route handler, guarded by an in-flight lock; the `jwt` callback does no
  network I/O and only flags expiry. GitHub's refresh tokens are single-use and rotating, and
  Next forbids setting cookies during render, so refreshing anywhere else silently destroys the
  session about eight hours after a successful login.
- Let the user override any automatic classification, at file **or folder** level.
- Update `.claude/ARCHITECTURE.md` in the **same commit** whenever files are added, removed,
  moved, or repurposed.

### Ask first

- Any new persisted field that could carry code, secrets, or unexpectedly sensitive metadata.
- Changing the PDF **geometry** — `generate.js` is the reference for A4, 60pt margins, 9pt code,
  13pt bold filename titles, `lineGap` 2, alphabetical order, and one continuous flow with no
  per-file page break and no page numbers. The output must keep matching all of that.
  - **Approved exception (typeface).** The reference's `Courier` / `Helvetica-Bold` are replaced
    by an embedded Unicode monospace family, because the standard fonts render any non-ASCII
    character as garbage and measure it as 0pt wide, which also corrupts the page count. Since
    font metrics differ, **pagination will not match the reference** — only geometry does. Do not
    "restore fidelity" by reverting the font.
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
- [ ] Exporting produces a PDF matching the `generate.js` **geometry** (see §6) and records every
      included file.
- [ ] A file containing non-ASCII characters renders correctly and is counted correctly — no
      `.notdef` glyphs, no zero-width lines, no unwrapped rows.
- [ ] The running total shown before export equals the exported PDF's real page count exactly.
- [ ] An exported file cannot be silently included again — reselecting it warns.
- [ ] A past export re-downloads by re-fetching pinned commit SHAs; if a repo or commit is gone
      it shows `source-gone` and points to the emailed copy rather than failing obscurely.
- [ ] Settings exports all user data and deletes the account with its data.
- [ ] Anonymous mode generates a PDF from uploaded files with nothing persisted.
- [ ] A database dump contains no source code and no usable GitHub credential.
