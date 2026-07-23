# TODO — code-excerpt-pdf

Task list for `docs/tasks/plan.md`. Work top to bottom; slices are ordered by dependency. Every slice
must end green on `npm run test && npm run typecheck && npm run lint && npm run build`.

Legend: **[!]** blocks later work · **[ext]** human/external action with lead time

---

## Setup — minimum shared groundwork

- [x] `npm i pdfkit` (0.19.1) + `npm i -D @types/pdfkit`
- [x] Add `postinstall` that copies `node_modules/pdfkit/js/pdfkit.standalone.js` →
      `public/vendor/` (keeps the version pinned) — `scripts/copy-pdfkit.mjs`; the copy is
      gitignored and excluded from ESLint + Prettier
- [x] `npm i -D vitest` (4.1.10); add `vitest.config.ts` (env `node`, no jsdom) and
      `test` / `test:watch` scripts - [x] **Verify `@/*` resolves in a test** — `lib/utils.test.ts` is the standing guard. **Deviation:
      `vite-tsconfig-paths` is NOT used** — Vite 8 resolves tsconfig paths natively and the plugin
      now prints a deprecation notice, so the config sets `resolve.tsconfigPaths: true` instead.
      Confirmed RED (`Cannot find package '@/lib/utils'`) before the option was added
- [x] `app/globals.css` — add `--font-mono: var(--font-mono);` to `@theme inline` (currently
      missing, so `font-mono` does not resolve to Geist Mono)
- [x] `.gitignore` — add `!.env.example` (the `.env*` line would swallow it)
- [x] `package.json` — change `format` to `prettier --write .`
- [x] Clean up `app/layout.tsx`: remove the unused `Geist` import and the stray semicolon on the
      `cn` import

---

## Slice 0 — pdfkit + font + page-model spike **[!]**

Throwaway UI; timebox 1 day. Highest-value spike — everything downstream assumes it passes.

- [x] Rename `generate.js` → `generate.cjs` (it currently throws `ReferenceError: require is not
defined` under `"type": "module"`) and update `.claude/ARCHITECTURE.md` in the same commit - [x] The rename alone does **not** make `npm run lint` green: `@typescript-eslint/no-require-imports`
      fires on `.cjs` too. Added a `files: ["**/*.cjs"]` override in `eslint.config.mjs` disabling
      that rule — `npm run lint` is now green for the first time
- [x] Run `node generate.cjs <fixture-dir>` and keep the output as the geometry reference —
      verified working (`node generate.cjs components`); `output/` is gitignored
- [x] Choose a Unicode monospace font (regular + bold, Cyrillic coverage) — **JetBrains Mono**,
      OFL, vendored full into `public/fonts/`. Every glyph advances 600/1000 em, Cyrillic
      included. **Deviation: NOT subset.** Measured saving was only 31% (35 KB/weight) against
      reintroducing the `.notdef` risk the embedded font exists to eliminate — and `.notdef`
      corrupts the page count, not just the looks
- [x] Throwaway page + Web Worker loading `pdfkit.standalone.js` from `/public/vendor/`
- [x] Collect chunks via `doc.on("data", …)` → `new Blob(...)`; **`blob-stream` not added**

Acceptance:

- [x] Worker runs under **both** `npm run dev` and `npm run build && npm run start`, with
      `next.config.ts` still empty — verified in real headless Chrome over CDP, both modes PASS
- [x] Embedded font renders Latin **and** Cyrillic; non-zero width for Cyrillic
      (`widthOfString("привіт") = 32.40pt`, identical to the same-length Latin string)
- [x] `heightOfString(...) / lineAdvance` is an integer across the corpus: long lines, a
      5,000-char minified line, CRLF, tabs, no trailing newline, Cyrillic, ligature pairs
- [x] Arithmetic paginator equals `doc.bufferedPageRange().count` — **exact, no ±1**, across a
      12-case page-boundary sweep, ~10,000 lines over 40 files, Cyrillic-heavy input, and this
      repo's own source. The `lineGap` asymmetry is encoded in `Cursor` in `lib/pdf/measure.ts`
- [x] Geometry matches `generate.cjs` — `lib/pdf/constants.ts` carries the reference values
      verbatim (A4, 60pt margins, 9/13pt, lineGap 2/4, moveDown 0.8/1.5, continuous flow)
- [x] Route First Load JS does **not** grow by ~1 MB — pdfkit is not in the build graph at all:
      total `.next/static` JS is 655 KB while the standalone bundle alone is 2.4 MB. The worker
      fetches `/vendor/pdfkit.standalone.js` itself via `importScripts`

**Two findings the spike existed to catch** (both would have shipped as runtime crashes):

1. **JetBrains Mono's `calt` ligatures crash fontkit** — `RangeError: Offset is outside the
bounds of the DataView` on `//`, `=>`, `!=`, `<=`, `===`, `->`. Real source hits one within a
   few lines. `TEXT_FEATURES` in `lib/pdf/constants.ts` disables them **by name**; passing an
   empty array does not work. Never call `text`/`heightOfString`/`widthOfString` without it
2. **`bufferedPageRange().count` returns 1** unless the doc is built with `bufferPages: true` —
   the ground truth was silently wrong at first, and made a correct paginator look broken

- [x] ~~Amend `docs/SPEC.md`~~ — **done ahead of slice 0**; see `docs/tasks/plan.md` § "SPEC
      amendments"

> **If the worker or the paginator fails → STOP.** Fallback is a server-side render route, which
> reorders the whole plan. Raise it before continuing.

---

## Slice 1 — Anonymous flat export

- [x] `lib/pdf/constants.ts` — the entire visual contract in one file (landed in slice 0)
- [x] `lib/pdf/measure.ts`, `lib/pdf/render.ts` + tests
- [x] `lib/uniqueness/hash.ts` + test — SHA-256 via `crypto.subtle` - [x] **Hash raw bytes, before** the `\t` → two-space transform, with the reason in a comment.
      Tests pin it: a tab and the two spaces it renders as must hash differently, as must CRLF
      and LF
- [x] `renderPdf()` returns `{ blob, pageCount, files[] }` from a **single** run, and throws if
      the document lacks `bufferPages` rather than silently reporting one page
- [x] `components/local/file-drop.tsx`, `components/pdf/download-button.tsx`,
      `app/(app)/local/page.tsx`, plus `hooks/use-pdf-worker.ts` and
      `components/pdf/render.worker.ts`
- [x] `lib/files/decode.ts` — bytes → text, or a reason (binary / bad UTF-8); also strips a BOM
- [x] `app/spike/` deleted, as slice 0 planned
- [x] shadcn via CLI: `card empty alert badge table spinner separator`

Acceptance — all verified end to end in real headless Chrome over CDP:

- [x] N files → one PDF, alphabetical, continuous flow, no page numbers.
      `middle.ts, zebra.ts, альфа.ts` — UTF-16 code-unit order, matching `generate.cjs`
- [x] Running total equals the downloaded PDF's real page count **exactly** — 10 shown,
      10 `/Type /Page` objects in the captured blob, 10 reported after export
- [x] Binary files rejected with a visible reason —
      "logo.png — Looks like a binary file (contains a NUL byte), not source code."
- [x] `pageCount` deterministic across runs for a fixed fixture
- [x] Zero network requests fire on export — captured via CDP during the click: `[]`.
      pdfkit and the fonts are fetched once at worker start-up, from this app's own origin,
      and no file content ever leaves the page

**Note for slice 2:** `drawFiles()` in `lib/pdf/render.ts` is now the only draw loop, and
`measure.test.ts` validates the paginator against it rather than a copy — keep it that way.

## Slice 2 — Anonymous folder tree

- [x] `lib/tree/types.ts` — `FileEntry`, `ContentSource` (the seam that makes GitHub a swap of one
      implementation in slice 5)
- [x] `lib/tree/build.ts`, `lib/tree/selection.ts`, `lib/sources/local.ts` + tests
- [x] `lib/pdf/estimate.ts` + calibration test against this repo's own source as corpus
- [x] `npx shadcn@latest add checkbox collapsible scroll-area` (badge was already in). base-ui
      `Checkbox` does have a native `indeterminate` prop — confirmed in its source that the
      indicator renders when *checked OR indeterminate*, so the tri-state is a matter of which
      glyph shows. `components/ui/checkbox.tsx` gained a `MinusIcon` for that
- [x] `components/tree/{tree-view,tree-node,tree-toolbar,page-total}.tsx`
- [x] Folder upload via `webkitdirectory` (set imperatively — there is no JSX prop for it)
- [x] **Render estimate _and_ exact side by side** — `~N` dev-only column beside the badge, which
      shows exact once measured and the estimate until then

Acceptance — verified end to end in real headless Chrome over CDP:

- [x] Correct nested tree; folder nodes show aggregate estimate + available-vs-total counts
      (`proj 4/4 4p`, `docs 1/1 1p`, `src 3/3 3p`)
- [x] Tri-state checkbox: selecting `src` left its parent `proj` **indeterminate** while `src`
      itself read **checked**; unchecking one grandchild pushed both to indeterminate
- [x] Folder select reports "Added 3, skipped 0 used, 0 vendored"
- [x] Running total updates on every toggle (0 → 4 → 3)
- [x] **No target input field exists anywhere in the UI** — the DOM holds exactly 2 file pickers
      and 8 checkboxes, zero number or text inputs
- [x] Estimator never under-estimates by more than one page across the corpus (`estimate.test.ts`)
      — **but see the limits below; the corpus was not representative**

### Estimator limits — found after the slice closed

The calibration corpus was this repo's own source, which contains no structured-data or
blank-line-heavy files, so the guarantee held only for shapes it happened to include. Probing
other shapes found real under-counting, and `lib/pdf/estimate.ts` now takes the file extension
into account: sparse JSON went from 24 pages short to 3 over, stylesheets from 2 short to 2 over.

**What is still wrong, and cannot be fixed from size alone:**

- dense JSON over-counts by roughly 4x — its lines are nothing like any constant
- bullet-list markdown still under-counts by ~3 pages
- a file that is half blank lines under-counts hopelessly; no constant above 2 bytes/line covers it

**Open question for a human:** SPEC's "never under-estimate by more than one page" is not
achievable from `size` alone — bytes carry no information about line structure. Either the
constants keep getting more conservative (which is what made dense JSON 4x over) or SPEC says the
estimate is indicative and the exact running total is the real contract. Worth deciding before
slice 5 leans on it.

This matters less than it first appears: the estimate never feeds the running total, which is
computed from exact measurements of the selected files — in GitHub mode too, since selecting a
file is what fetches its blob. A bad estimate shows up as a surprising jump on selection, not a
short export.
- [x] Running total still equals the exported PDF exactly: 3 shown, 3 `/Type /Page` objects, 3
      reported

**Bug found and fixed during verification:** every tree row showed `0p` until the first selection,
because font metrics only arrived with the first measurement. They are now fetched up front, since
they do not depend on any file.

## Slice 3 — Vendored detection

- [x] `lib/vendored/index.ts` (precedence resolver), `gitattributes.ts`, `plugins/shadcn.ts`,
      `structural.ts`, plus `glob.ts` and `types.ts` + tests
- [x] Tree markers, toolbar show/hide toggle, warn-on-add dialog
- [x] Overrides in React state (persistence is slice 8)
- [x] `commonRoot()` in `lib/tree/build.ts` — a directory picker prefixes every path with the
      dropped folder's name, so repo config sits under it and detection must work relative to
      the repo, not the drop

Acceptance — verified in real headless Chrome:

- [x] Precedence: manual > `.gitattributes` > shadcn plugin > structural list
- [x] Folder rules cascade to descendants **including files added later** (resolver runs per
      query, never precomputed); file beats folder; deeper folder beats shallower
- [x] Adding a vendored file **warns and proceeds** — dialog offers "Add it anyway", and the
      file lands in the selection
- [x] Hidden by default, with a show toggle carrying a count
- [x] Dropping this repo's shape: `components/ui/button.tsx` flagged via `components.json` →
      `aliases.ui`; `components/theme-provider.tsx` untouched; `legacy/*` flagged by
      `.gitattributes`; `node_modules` by the structural list. Unmarking `button.tsx` stuck and
      survived a hide/show cycle

## Slice 3.5 — PDF preview

- [x] `components/pdf/pdf-preview.tsx` — `<iframe>` over an object URL; pdf.js not needed
- [x] Explicit "Preview" trigger, not live-on-toggle
- [x] **One render for both preview and download**, cached against
      `selectionSignature()` (name + byte length + FNV checksum, order-insensitive)
- [x] `URL.revokeObjectURL` on unmount and on blob change — derived via `useMemo` rather than
      `useState`, since React 19 lints against setState inside an effect
- [x] Fallback "Open in a tab" link plus a note for browsers that refuse inline PDFs

Acceptance — verified in real headless Chrome:

- [x] Preview shows the same document the download produces — the download saved the **identical
      Blob object** the preview displayed, not merely equal bytes
- [x] Page count agrees everywhere: running total 4, preview badge 4, `/Type /Page` objects 4,
      "Exported 4 pages"
- [x] Changing the selection drops the preview instead of showing a stale one
- [x] No object URL survives: both were revoked
- [x] Non-ASCII and ligature-heavy files render (fixture used Cyrillic and `!==`)

## ▸ CHECKPOINT A — full UX, zero infrastructure

- [ ] Review the whole experience on a real repo before any account or database exists
- [ ] **[ext]** Register the GitHub App: `Contents: Read-only`, callback URL, **separate Setup
      URL**, "Request user authorization during installation" **unchecked**, "Expire user
      authorization tokens" **on**. Record client ID, secret, app slug
- [ ] **[ext]** Create the Neon project; capture **both** the pooled and direct connection strings

---

## Slice 4 — Sign in with the GitHub App **[!]**

> **Code written, credentials pending.** Everything below is implemented and type-checks, but
> nothing here can be exercised until a GitHub App exists. The manual verification in Checkpoint B
> is still owed. Two things changed while writing it: the access token is deliberately **not** on
> the `Session` (that would have broken "no token in any RSC payload" — `/api/auth/session` is
> readable by the browser), and `unstable_update` updates the Session rather than the JWT, so
> refreshed tokens feed back through the `jwt` callback's `update` trigger.
>
> **UI now built too.** `app/(app)/layout.tsx` (header, sign in/out as Server Actions),
> `app/(app)/projects/page.tsx` and `app/api/github/repos/route.ts` exist and were exercised in
> headless Chrome — signed out, and signed in against a synthetic session cookie with the
> GitHub API intercepted. What still needs real credentials is the OAuth round trip itself.


Riskiest infra slice; keep it alone. Budget a 1-day spike inside it, against a real deploy.

- [ ] `auth.ts` (Auth.js v5, JWT strategy, **no adapter**), `app/api/auth/[...nextauth]/route.ts`
- [ ] **Override provider scope to `""`** — the default is `read:user user:email`, and a GitHub App
      ignores scopes entirely
- [ ] Handle the private-email case: either grant account-level _Email addresses: Read_ or supply a
      `profile()` tolerating a null email (otherwise it passes your test and fails in production)
- [ ] `app/api/github/setup/route.ts` — dedicated Setup URL, **idempotent** (repo-selection changes
      return through it too)
- [ ] `app/api/github/refresh/route.ts` — the **only** place refresh happens; in-flight promise map
      so parallel blob fetches cannot trigger parallel refreshes
- [ ] `jwt` callback does **no network I/O** — it only sets `token.error = "expired"`
- [ ] Track `refresh_token_expires_in` (6 months) → clean re-auth, not a 500
- [x] `lib/github/installation.ts` (`GET /user/installations` → `total_count === 0`) — now goes
      through `githubFetch`, so `client.ts` really is the only caller of api.github.com, and a
      revoked grant surfaces as the same mapped `GitHubError` as everything else
- [x] `app/(app)/layout.tsx`, `app/(app)/projects/page.tsx`, `.env.example`. Also
      `app/api/github/repos/route.ts` (installations → repositories), `lib/github/repos.ts`
      (Zod), `lib/github/repo-id.ts` (`owner_repo` segment) and `components/auth`,
      `components/projects/repo-list.tsx`
- [x] **`AUTH_TRUST_HOST` documented in `.env.example`** — found while verifying: on any host
      Auth.js cannot infer, `auth()` throws `UntrustedHost` and every page silently renders as
      signed out, which reads as a broken login rather than a config gap

Acceptance:

- [ ] Sign-in reaches only the repos selected at install
- [ ] Authenticated-but-no-installation routes to the install URL, and the return lands on a
      **working** page (not a CSRF error) — the install CTA is built and renders from
      `totalCount === 0`; the round trip itself still needs a real App
- [ ] Session survives refresh; expired token refreshes transparently under **5 concurrent**
      requests
- [ ] `grep -rn "repo" auth.ts` finds no scope
- [ ] No token in any log or RSC payload
- [ ] **Tested on a Vercel preview, not localhost** — in-process locks stop helping across lambdas

## ▸ CHECKPOINT B — auth security review

- [ ] Dedicated manual pass (SPEC §5 accepts no e2e coverage here). Revoke on GitHub, refresh,
      confirm graceful handling. Grep the build output for the client secret

---

## Slice 5 — GitHub repos end to end (still no persistence)

> **Complete, but verified against an intercepted GitHub rather than the real one.** The whole
> path — page, tree, selection, running total, preview, download — was driven in headless Chrome
> with a synthetic session cookie and `/api/github/*` fulfilled from fixtures over CDP. That
> proves the page and the call pattern; it does not prove the OAuth round trip or GitHub's real
> response shapes beyond what the Zod schemas assert.


- [x] `lib/github/{client,tree,blob,errors,concurrency}.ts`
- [x] `app/api/github/{tree,blob}/route.ts` — **all GitHub access lives here, never in RSC**
- [x] Zod schemas for the Trees response (first untrusted JSON), and for the repositories one
- [x] `lib/sources/github.ts` implementing `ContentSource`, plus `lib/sources/github-cache.ts`.
      **Deviation: no React Query.** The source already caches the tree and every blob; the only
      gap was that a remount built a *new* source, which a module-scoped map fixes in ten lines.
      A query library would have been a second cache holding the same truth
- [x] `lib/github/refreshing-fetch.ts` — the client half of the `401 token-expired` contract:
      refresh through the one route allowed to, retry once, single-flight so parallel blob reads
      cannot spend several single-use refresh tokens
- [x] `app/(app)/projects/[repoId]/page.tsx` + `components/projects/repo-workspace.tsx`

Acceptance:

- [x] Opening a repo issues exactly **one** `recursive=1` Trees call — one, in a captured trace
- [x] Navigating away and back in-session issues **zero** further GitHub calls — verified by
      leaving for `/projects` and returning: still one tree call, list still rendered
- [x] Content fetched only for selected files — selecting `src` fetched exactly its two blobs.
      Plus `.gitattributes` on open, which vendored detection needs (same as anonymous mode)
- [x] Truncated tree (large monorepo) surfaced honestly, not silently dropped — a banner on the
      page, driven by `isTruncated()`. **Not exercised with a truncated fixture**
- [x] Export uses the identical pipeline to anonymous mode — literally the same hook and the
      same panel. Running total 3, preview 3, `/Type /Page` objects 3

## ▸ CHECKPOINT C — API budget review

- [ ] Confirm call counts in a real network trace before persistence obscures them; check headroom
      against 5000/hr

---

## Slice 6 — Uniqueness (migration 1)

> **Everything is written and every rule is under test; NO MIGRATION HAS BEEN RUN.**
> `npx prisma migrate dev --name init` needs a live Neon database and the user declined to have
> one touched, so nothing below has executed a single SQL statement. What that leaves unproven is
> listed under "What is still owed" at the end of this slice — read it before calling slice 6
> done. Note the plan expected `migrations.url` in `prisma.config.ts`; Prisma 7.9 actually takes
> `datasource.url` — verified against the installed types.


- [x] `prisma/schema.prisma` — **only** `User`, `Repo`, `Export`, `UsedFile`. **Deviation:
      `Repo.githubRepoId` is not stored** and `Repo` is keyed on `(userId, owner, name)`; the
      reasoning is argued at the bottom of the schema file. `defaultBranch` became optional for
      the same reason — nothing ever holds it for free, and regeneration pins commit SHAs
- [x] `prisma.config.ts` (`datasource.url` moved here); generator `prisma-client` with
      `output = "../lib/db/generated"`
- [x] `lib/db/client.ts` — `PrismaNeon` adapter + `globalThis` singleton, built **lazily**:
      `auth.ts` now reaches the database and every page imports `auth.ts`, so a client
      constructed at module scope would be constructed during `next build`
- [x] `DATABASE_URL` (pooled, runtime) **and** `DIRECT_URL` (unpooled, migrations)
- [x] `"postinstall": "prisma generate"`
- [x] Resolve empirically whether `serverExternalPackages` / a Turbopack alias is needed for the
      custom output path — **neither is**; `npm run build` compiles and collects `/api/exports`
      with `next.config.ts` still empty. Recorded there with the reasoning
- [x] Upsert `User` from the `signIn` callback (no `@auth/prisma-adapter` — no Prisma 7 support).
      The upsert is allowed to fail silently and `POST /api/exports` repeats it, so a database
      hiccup costs an early write rather than a sign-in
- [x] `app/api/exports/route.ts` (POST records, GET lists) plus `app/api/exports/used/route.ts`
      (the ledger for one repo), `lib/uniqueness/status.ts` + test
- [x] **`lib/db/exports.ts` is a port, not a module that imports Prisma.** The client is a
      parameter, so `exports.test.ts` proves the rules against an in-memory fake with no database
      — which is the only way any of this could be tested at all here. `lib/db/exports-db.ts` is
      the single adapter; `const db: ExportsDb = prisma` does not compile, because Prisma's
      methods are generic
- [x] `lib/exports/payload.ts` + test — the NDA constraint enforced at the boundary: Zod names
      every field it keeps, so a client sending `content` alongside a path cannot reach Prisma

Acceptance:

- [x] Export persists one `UsedFile` per file with `commitSha`, `contentHash`, `sizeBytes` —
      asserted in `lib/db/exports.test.ts`, including a key-by-key check that nothing else rides
      along. **Against the fake, not a database**
- [x] Used files marked on next load; same path + new hash → `used-but-changed` —
      `lib/uniqueness/status.test.ts`, wired into the repo view
- [x] A used file can never silently re-enter a listing — bulk folder select skips it and counts
      it, and picking one by hand warns first (SPEC forbids hard-blocking)
- [x] Per-project stats compute with **no** extra GitHub call — `lib/uniqueness/stats.ts` is
      arithmetic over `UsedFile.sizeBytes` and the tree listing already in hand
      (`stats.test.ts`)

### What is still owed on slice 6

- [x] Migration 1 exists on disk as `prisma/migrations/20260723120000_init/`, written **offline**
      with `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
      `migrate diff` is read-only and opens no connection, so the four-model migration Checkpoint
      D reviews is now a reviewable artifact rather than something `migrate dev` would have to
      invent later — which is what keeps migrations 2 and 3 separable at all
- [ ] **[ext]** APPLY migration 1 against a real Neon database (`npx prisma migrate deploy`),
      then re-run the whole flow. The SQL exists but has never executed, no query has ever hit
      Postgres, and the compound key `userId_owner_name` is proven only by the generated types
- [ ] Exercise sign-in → export → reopen the repo on a real database and confirm the row shows
      as `used`

## ▸ CHECKPOINT D — NDA review of migration 1

- [ ] `pg_dump` and grep for source code and anything credential-shaped

---

## Slices 7–11

- [x] **7 — Exports history + regeneration.** `app/(app)/exports/page.tsx` lists past exports
      newest first (zero GitHub calls to open it). A rebuild re-lists at the **pinned commit
      SHA** — one Trees call per distinct SHA, never HEAD — and renders through the same worker.
      Original vs rebuilt page count is shown **informationally**; `source-gone` points at the
      emailed copy. `lib/exports/regenerate.ts` + test cover the whole decision table: a 404 on
      the pinned tree is `source-gone`, a 429 throws so a rate limit is never mistaken for a
      deleted repository, and a deleted file or a hash mismatch is reported while the rest is
      still rebuilt. **Not exercised against real GitHub or a real database** — see below
- [ ] **8 — Persisted classifications (migration 2).** Overrides survive refresh. NDA review
- [ ] **9 — Neon `TreeCache` tier (migration 3).** Head-SHA invalidation, manual Refresh, TTL
      backstop. Pure optimization — no acceptance criterion depends on it. NDA review
- [ ] **10 — Settings + GDPR.** Repo-access link out to GitHub, full data export, account deletion.
      **Must be last** — it enumerates the final schema
- [ ] **11 — Marketing.** `app/(marketing)/` landing, ToS, privacy. Parallelizable from slice 4 on

> **Slices 6 and 7 were built with no database reachable.** Migration 1 has never been applied,
> so no query in this codebase has ever executed. Everything is proven against an in-memory fake
> (`lib/db/exports.test.ts`) and an intercepted GitHub (`lib/exports/regenerate.test.ts`); the
> Prisma call shapes are proven only by the generated types, through the adapter in
> `lib/db/exports-db.ts`. Nothing in the browser has been driven end to end for these two slices.
> Before either can be called done: run the migration, then sign in → export → reopen the repo →
> re-download from the history page, on a real account.

## ▸ CHECKPOINT E — pre-launch

- [ ] `pg_dump` inspection against the final schema
- [ ] Exercise GDPR export **and** delete on a real account
- [ ] ToS and privacy live
- [ ] Rate-limit behaviour verified on a large repo
- [ ] Only then: put the public-instance link in the repo description
