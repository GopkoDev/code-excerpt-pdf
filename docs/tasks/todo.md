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

- [ ] `lib/tree/types.ts` — `FileEntry`, `ContentSource` (the seam that makes GitHub a swap of one
      implementation in slice 5)
- [ ] `lib/tree/build.ts`, `lib/tree/selection.ts`, `lib/sources/local.ts` + tests
- [ ] `lib/pdf/estimate.ts` + calibration test against the dropped folder as corpus
- [ ] `npx shadcn@latest add checkbox collapsible badge scroll-area` (base-ui `Checkbox` has a
      native `indeterminate` prop — that is the tri-state)
- [ ] `components/tree/{tree-view,tree-node,tree-toolbar,page-total}.tsx`
- [ ] Folder upload via `webkitdirectory`
- [ ] **Render estimate _and_ exact side by side** (estimate in a dev-only column) — otherwise the
      byte estimator ships to slice 5 uncalibrated

Acceptance:

- [ ] Correct nested tree; folder nodes show aggregate estimate + available-vs-total counts
- [ ] Tri-state checkbox: none / partial / all
- [ ] Folder select reports "added N, skipped X used, Y vendored"
- [ ] Running total updates on every toggle
- [ ] **No target input field exists anywhere in the UI**
- [ ] Estimator never under-estimates by more than one page across the corpus

---

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
