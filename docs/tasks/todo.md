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

- [ ] `lib/vendored/index.ts` (precedence resolver), `gitattributes.ts`, `plugins/shadcn.ts`,
      `structural.ts` + tests
- [ ] Tree markers, toolbar show/hide toggle, warn-on-add dialog
- [ ] Overrides in React state (persistence is slice 8)

Acceptance:

- [ ] Precedence: manual > `.gitattributes` > shadcn plugin > structural list
- [ ] Folder rules cascade to descendants **including files added later**; file beats folder
- [ ] Adding a vendored file **warns and proceeds** — never hard-blocks
- [ ] Hidden by default, with a show toggle
- [ ] Drop **this repo**: `components/ui/button.tsx` is flagged via `components.json` →
      `aliases.ui`, and unmarking it sticks

---

## Slice 3.5 — PDF preview

Placed **before** Checkpoint A on purpose: that checkpoint exists to judge the whole experience
before any infrastructure lands, and "can I see what I am about to submit?" is part of the
experience. Blocks nothing — if it slips, move it after Checkpoint A rather than delaying the
GitHub App registration.

Today the only way to see the output is to download it and open it in another app. Preview closes
that loop, and makes the SPEC §6 geometry contract checkable by eye without leaving the page.

- [ ] `components/pdf/pdf-preview.tsx` — `<iframe>` over an object URL. **Start here, not with
      pdf.js**: the browser's built-in viewer costs zero bytes and gives scrolling, zoom and print
      for free. Only reach for pdf.js if page thumbnails or in-page navigation are actually wanted
- [ ] Explicit trigger (a "Preview" button), **not** live-on-toggle. The entire architecture —
      cached line counts, arithmetic paginator — exists so that selection changes never re-render
      the PDF. A preview that re-renders on every checkbox would throw that away
- [ ] **Reuse one render for both preview and download.** Cache the `RenderResult` against a
      selection signature (sorted paths + `contentHash`), invalidate when it changes, and have the
      download button serve the cached blob when it is still valid
- [ ] `URL.revokeObjectURL` on unmount and on every re-render, or each preview leaks the whole
      document
- [ ] Fallback link ("open in a new tab") — some browsers and extensions refuse to render PDFs in
      an iframe, and a blank grey box is a worse failure than a link

Acceptance:

- [ ] Preview shows the same document the download produces — **byte-identical**, because it is
      literally the same blob
- [ ] The page count under the preview equals the running total and the exported PDF
- [ ] Changing the selection invalidates the preview rather than showing a stale document
- [ ] No object URL survives unmount (check `performance.memory` or just assert revoke is called)
- [ ] Non-ASCII and ligature-heavy files render in the preview exactly as in the download

> **Do not let preview become a second render path.** The rule from slice 1 stands: `actualPages`
> must come from the run that produced the bytes the user received. Two renders means two page
> counts that are free to disagree — the exact failure the single-run rule was written to prevent.

---

## ▸ CHECKPOINT A — full UX, zero infrastructure

- [ ] Review the whole experience on a real repo before any account or database exists
- [ ] **[ext]** Register the GitHub App: `Contents: Read-only`, callback URL, **separate Setup
      URL**, "Request user authorization during installation" **unchecked**, "Expire user
      authorization tokens" **on**. Record client ID, secret, app slug
- [ ] **[ext]** Create the Neon project; capture **both** the pooled and direct connection strings

---

## Slice 4 — Sign in with the GitHub App **[!]**

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
- [ ] `lib/github/installation.ts` (`GET /user/installations` → `total_count === 0`)
- [ ] `app/(app)/layout.tsx`, `app/(app)/projects/page.tsx`, `.env.example`

Acceptance:

- [ ] Sign-in reaches only the repos selected at install
- [ ] Authenticated-but-no-installation routes to the install URL, and the return lands on a
      **working** page (not a CSRF error)
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

- [ ] `lib/github/{client,tree,blob,errors,concurrency}.ts`
- [ ] `app/api/github/{tree,blob}/route.ts` — **all GitHub access lives here, never in RSC**
- [ ] Zod schemas for the Trees response (first untrusted JSON)
- [ ] React Query provider; `lib/sources/github.ts` implementing `ContentSource`
- [ ] `app/(app)/projects/[repoId]/page.tsx`

Acceptance:

- [ ] Opening a repo issues exactly **one** `recursive=1` Trees call
- [ ] Navigating away and back in-session issues **zero** further GitHub calls
- [ ] Content fetched only for selected files; concurrency capped 3–5
- [ ] Truncated tree (large monorepo) surfaced honestly, not silently dropped
- [ ] Export uses the identical pipeline to anonymous mode

## ▸ CHECKPOINT C — API budget review

- [ ] Confirm call counts in a real network trace before persistence obscures them; check headroom
      against 5000/hr

---

## Slice 6 — Uniqueness (migration 1)

- [ ] `prisma/schema.prisma` — **only** `User`, `Repo`, `Export`, `UsedFile`
- [ ] `prisma.config.ts` (`datasource.url` moved here); generator `prisma-client` with
      `output = "../lib/db/generated"`
- [ ] `lib/db/client.ts` — `PrismaNeon` adapter + `globalThis` singleton
- [ ] `DATABASE_URL` (pooled, runtime) **and** `DIRECT_URL` (unpooled, migrations)
- [ ] `"postinstall": "prisma generate"`
- [ ] Resolve empirically whether `serverExternalPackages` / a Turbopack alias is needed for the
      custom output path — **record the answer in `next.config.ts` with a comment**
- [ ] Upsert `User` from the `signIn` callback (no `@auth/prisma-adapter` — no Prisma 7 support)
- [ ] `app/api/exports/route.ts`, `lib/uniqueness/status.ts` + test

Acceptance:

- [ ] Export persists one `UsedFile` per file with `commitSha`, `contentHash`, `sizeBytes`
- [ ] Used files marked on next load; same path + new hash → `used-but-changed`
- [ ] A used file can never silently re-enter a listing
- [ ] Per-project stats compute with **no** extra GitHub call

## ▸ CHECKPOINT D — NDA review of migration 1

- [ ] `pg_dump` and grep for source code and anything credential-shaped

---

## Slices 7–11

- [ ] **7 — Exports history + regeneration.** Re-fetch pinned SHAs; show original vs current page
      count **informationally** (never as a gate); graceful `source-gone` pointing to the emailed
      copy
- [ ] **8 — Persisted classifications (migration 2).** Overrides survive refresh. NDA review
- [ ] **9 — Neon `TreeCache` tier (migration 3).** Head-SHA invalidation, manual Refresh, TTL
      backstop. Pure optimization — no acceptance criterion depends on it. NDA review
- [ ] **10 — Settings + GDPR.** Repo-access link out to GitHub, full data export, account deletion.
      **Must be last** — it enumerates the final schema
- [ ] **11 — Marketing.** `app/(marketing)/` landing, ToS, privacy. Parallelizable from slice 4 on

## ▸ CHECKPOINT E — pre-launch

- [ ] `pg_dump` inspection against the final schema
- [ ] Exercise GDPR export **and** delete on a real account
- [ ] ToS and privacy live
- [ ] Rate-limit behaviour verified on a large repo
- [ ] Only then: put the public-instance link in the repo description
