# Implementation Plan — code-excerpt-pdf

## Context

`docs/SPEC.md` defines a tool that produces print-ready PDF listings of source code for a tax filing.
The user picks whole files from a GitHub repo tree among the **unused** ones, watches a **running
page count** accumulate, and exports a PDF. Every exported file is recorded so it can never
appear again. Hard constraint: **no source code is ever stored** — only commit SHAs and content
hashes.

The repo is a bare Next.js 16.2.6 / React 19.2.4 scaffold. Nothing in the stack is installed yet:
no Prisma, no Auth.js, no pdfkit, no Vitest. This plan sequences the build from zero.

Planning surfaced findings that change the approach; they are documented before the slices.

---

## Findings that change the plan

### 1. `generate.js` cannot currently run — and its role must be redefined

`package.json` has `"type": "module"`, so `require` throws `ReferenceError`. Combined with pdfkit
not being installed, the file SPEC calls "the visual reference" is unrunnable. **Rename to
`generate.cjs`** in slice 0.

More importantly, the decision to **embed a Unicode monospace font** (finding 2) means different
font metrics, therefore different character widths, therefore **different pagination**. So
`generate.cjs` can no longer be a byte-fidelity target.

> **Its contract narrows to _geometry_:** A4, 60pt margins, 9pt code, 13pt bold filename titles,
> `lineGap` 2, `moveDown(0.8)` after a title, `moveDown(1.5)` between files, files alphabetical,
> one continuous flow with no per-file page break and no page numbers. The **typeface** is now
> explicitly allowed to differ.

### 2. Non-ASCII silently corrupts both rendering and page counts

pdfkit's standard fonts are WinAnsi-only. Any character outside WinAnsi maps to `.notdef` **and
measures 0pt wide** — so a line containing Cyrillic renders as garbage _and_ never wraps, making
the page count wrong. `generate.js` has this bug today.

**Decision taken: embed a Unicode monospace font.** Use **one family in two weights** (regular
for code, bold for titles) so filenames with non-ASCII work too. Subset the font to keep the
payload small.

### 3. Exact page counting is achievable — better than SPEC's byte-size estimate

`heightOfString(text, { width, lineGap })` runs pdfkit's real `LineWrapper` without emitting to
the stream and without page-breaking. Since every code line has a fixed advance,
`lines = round(height / lineAdvance)` is an **exact** integer.

Two-tier design:

- **Content in hand** → exact line count, computed once per file, cached next to `contentHash`.
- **Content not yet fetched** (tree view before selection) → byte-size estimate, biased to
  **over**-estimate, since under-shooting costs the user a regenerate cycle.
- **On every click** → pure arithmetic over cached line counts. No pdfkit, no re-render.

Trap to encode in tests: the line **advance includes `lineGap`** but the **page-break check does
not**. A naive simulator is off by a page.

### 4. Version realities that invalidate older guidance

| Thing                  | Reality                                                                                                  | Consequence                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Next 16                | Turbopack default for `dev` **and** `build`; no webpack plugins                                          | pdfkit's official webpack recipe is unusable               |
| Next 16                | middleware renamed to **`proxy.ts`**, defaults to **Node** runtime                                       | Pre-16 "Auth.js is edge-incompatible" guidance is obsolete |
| Prisma 7               | ESM-only, **driver adapters mandatory**, `output` required, `prisma.config.ts` replaces `datasource.url` | No `prisma-client-js`, no plain pooled-string setup        |
| `@auth/prisma-adapter` | Declares no Prisma 7 support                                                                             | **Skip the adapter** — JWT strategy needs none             |
| `next-auth`            | Still `5.0.0-beta.32`                                                                                    | Building on a beta; pin the exact version                  |

**pdfkit delivery:** load `pdfkit.standalone.js` (all node shims and font tables inlined, zero
deps) from `/public/vendor/` inside a **Web Worker**. Keeps `next.config.ts` empty, keeps 2.4 MB
out of the main bundle and out of Next's build graph, and keeps rendering off the main thread.
Copy it via a `postinstall` script so the version stays pinned to `node_modules/pdfkit`.

### 5. Token expiry — decision taken

Keep GitHub's **8-hour user tokens with refresh** (the stricter option). Known hazard: rotating
single-use refresh tokens + cookie-only storage + RSC produces random logouts
(`nextauthjs/next-auth#7522`), because Next forbids setting cookies during render.

**Required architecture, non-negotiable:**

- The `jwt` callback performs **no network I/O** — it only marks `token.error = "expired"`.
- Refresh happens in **exactly one** route handler that can write cookies, guarded by an
  in-flight promise map so 3–5 parallel blob fetches cannot trigger parallel refreshes.
- **No GitHub calls from Server Components, ever.** All access goes through `app/api/github/*`.
- Track `refresh_token_expires_in` (6 months) so an inactive user gets a clean re-auth, not a 500.

---

## Minimum shared setup (before slice 1)

1. `npm i pdfkit` + `npm i -D @types/pdfkit`; `postinstall` copies the standalone build to
   `public/vendor/`.
2. `npm i -D vitest` + `vitest.config.ts` + `test` / `test:watch` scripts. **Gotcha:** Vitest does
   not read `tsconfig.json` `paths`, so `@/*` breaks silently — add `vite-tsconfig-paths`.
   Environment stays `node`; no jsdom until a slice needs a component test.
3. `app/globals.css` — add `--font-mono: var(--font-mono);` to `@theme inline`. Currently missing,
   so `font-mono` does not resolve to Geist Mono.
4. `.gitignore` — `.env*` currently swallows `.env.example`; add `!.env.example`.
5. `package.json` — `"format": "prettier --write ."` (current glob skips `.css`, `.mjs`, `.md`,
   `schema.prisma`).

**Deliberately deferred:** `next.config.ts` changes (only if a spike proves them needed), Prisma
and Neon (slice 6), Auth.js and the GitHub App (slice 4), React Query (slice 5), Zod (slice 5),
the `(app)` shell (slice 4), marketing pages (slice 11).

---

## Slice sequence

Each slice is a complete vertical path, not a layer. Every slice ends green on
`npm run test && npm run typecheck && npm run lint && npm run build`.

### Slice 0 — pdfkit + font + page-model spike (throwaway)

The one deliberate exception to vertical slicing. Timebox **1 day**; the UI artifact is deleted
afterward. Highest-value spike of the project.

Rename `generate.js` → `generate.cjs`, choose and subset the Unicode mono font, get a hardcoded
PDF downloading from a throwaway page via a Web Worker.

**Must prove, in order:**

1. `pdfkit.standalone.js` runs in a Web Worker under `next dev` **and** `next build && next start`,
   with `next.config.ts` still empty.
2. The embedded font renders Latin **and** Cyrillic correctly, and `heightOfString` returns
   non-zero widths for Cyrillic.
3. `heightOfString(...) / lineAdvance` yields an integer across ~30 real files including: lines
   over the character-per-line limit, one 5,000-char minified line, CRLF endings, tabs, missing
   trailing newline, and Cyrillic comments.
4. The arithmetic paginator equals `doc.bufferedPageRange().count` for a ~10,000-line selection.
   If off by ±1, determine whether it is the `lineGap` asymmetry or the orphan guard **before**
   building UI on it.
5. Geometry matches `generate.cjs` even though pagination differs.

**If step 1 or 4 fails:** stop and re-open the approach. Fallback is a server route running Node
pdfkit, which moves auth/infra much earlier.

### Slice 1 — Anonymous flat export

**Delivers:** drop a few files, see exact page counts, watch a running total, download a
print-ready PDF. No account, no persistence, no network.

**Files:** `lib/pdf/constants.ts` (the entire visual contract in one file, because SPEC §6 makes
changing it ask-first), `lib/pdf/render.ts`, `lib/pdf/measure.ts`, `lib/uniqueness/hash.ts`
(SHA-256 via `crypto.subtle`, identical in browser and Vitest node env),
`components/pdf/download-button.tsx`, `components/local/file-drop.tsx`, `app/(app)/local/page.tsx`.

**Two decisions to lock here so slice 6 doesn't reshape everything:**

1. `renderPdf()` returns `{ blob, pageCount, files[] }` from a **single** run. `Export.actualPages`
   must come from the run that produced the downloaded bytes — never a second run, or the recorded
   count silently drifts from the PDF the user emailed.
2. **Hash raw bytes, before** the `\t` → two-space transform. Hashing post-transform means any
   future whitespace tweak invalidates every stored hash and resurrects used files.

### Slice 2 — Anonymous folder tree

**Delivers:** drop a whole project folder (`webkitdirectory`), browse it as a tree with per-file
and per-folder page estimates, tri-state select, folder select-all, running total, export.

**Files:** `lib/tree/types.ts` (`FileEntry`, `ContentSource` — the seam that makes GitHub a swap of
one implementation later), `lib/tree/build.ts`, `lib/tree/selection.ts`, `lib/pdf/estimate.ts`,
`lib/sources/local.ts`, `components/tree/*`. shadcn: `checkbox` (base-ui's `Checkbox` has a native
`indeterminate` prop — that is the tri-state), `collapsible`, `badge`, `scroll-area`.

> **Easy to skip, and costly:** anonymous mode has content in hand, so it can compute exact counts
> and never exercise the byte estimator — which is what the running total rests on once GitHub is
> involved. **Render both numbers** (estimate in a dev-only column beside exact) and calibrate the
> estimator against the dropped folder.

### Slice 3 — Vendored detection

**Delivers:** shadcn components and `node_modules`-style paths auto-flagged, hidden by default,
overridable per file or folder, warning rather than blocking on add.

**Files:** `lib/vendored/index.ts` (precedence resolver), `gitattributes.ts`, `plugins/shadcn.ts`,
`structural.ts`. Overrides live in React state this slice; persistence is slice 8.

> ### ▸ CHECKPOINT A — full UX, zero infrastructure
>
> The entire product experience exists and is deployable with no accounts, no env vars, no
> database. Cheapest possible moment to discover the UX is wrong.
>
> **Start the two external clocks during this pause** (human lead time, not coding work): register
> the GitHub App (`Contents: Read-only`, callback URL, **separate Setup URL**, "Expire user
> authorization tokens" **on**, record client ID/secret/slug) and create the Neon project (grab
> **both** the pooled and direct connection strings).

### Slice 4 — Sign in with the GitHub App

**Delivers:** sign in, see which repos the app can reach, sign out. Nothing else — the riskiest
infra slice, kept deliberately alone. Budget a **1-day spike inside it**, against a real deploy.

**Files:** `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/github/refresh/route.ts`,
`app/api/github/setup/route.ts`, `app/(app)/layout.tsx`, `app/(app)/projects/page.tsx`,
`lib/github/installation.ts`, `.env.example`.

**Three traps to handle explicitly:**

1. **Override the default scope to `""`.** The Auth.js GitHub provider defaults to
   `scope: "read:user user:email"`; a GitHub App uses fine-grained permissions and ignores scopes.
   Overriding means nothing in the codebase ever reads as requesting a scope.
2. **The provider's `userinfo` will 403 for users with a private email**, because it falls back to
   `/user/emails`, which needs the account-level _Email addresses: Read_ permission. This passes
   your own manual test and fails in production.
3. **Use a dedicated Setup URL, distinct from the auth callback, and leave "Request user
   authorization during installation" _unchecked_.** Otherwise GitHub returns to the callback
   without the `state` Auth.js issued, which is rejected as CSRF — the user installs successfully
   and lands on an error page. Treat the Setup URL as idempotent.

> ### ▸ CHECKPOINT B — auth security review
>
> SPEC §5 accepts _no e2e coverage_ for this flow. This is that manual verification, and it gets a
> dedicated pass rather than a glance at the end of a larger slice.

### Slice 5 — GitHub repos end to end (still zero persistence)

**Delivers:** pick a repo, browse its real tree in the slice-2 component, select files, export a
real PDF. The whole product, minus memory.

**Files:** `lib/github/{client,tree,blob,errors,concurrency}.ts`,
`app/api/github/{tree,blob}/route.ts`, `app/(app)/projects/[repoId]/page.tsx`,
`lib/sources/github.ts`, React Query provider, Zod schemas for the Trees response.

> ### ▸ CHECKPOINT C — API budget review
>
> Confirm the call-count criteria in a real network trace **before** persistence obscures them.
> Sanity-check headroom against the 5000/hr budget.

### Slice 6 — Uniqueness (migration 1)

**Delivers:** exported files are remembered. Re-opening a repo shows `used` and `used-but-changed`;
reselecting a used file warns.

**Migration 1 contains only `User`, `Repo`, `Export`, `UsedFile`** — not `Classification`, not
`TreeCache`.

**Prisma 7 shape:** `generator client { provider = "prisma-client", output = "../lib/db/generated" }`,
no `url` in `datasource` (moves to `prisma.config.ts`), `PrismaNeon` adapter, `globalThis`
singleton, `"postinstall": "prisma generate"`. Two connection strings: `DATABASE_URL` (pooled,
runtime) and `DIRECT_URL` (unpooled, migrations — the pooler fails on advisory locks). **No
`@auth/prisma-adapter`**; upsert the `User` row from the `signIn` callback.

Whether `serverExternalPackages` or a Turbopack alias is needed for the custom output path is
**unresolved** — determine empirically and record the answer in `next.config.ts` **with a comment**.

> ### ▸ CHECKPOINT D — NDA review of migration 1
>
> `pg_dump` the database and grep for source code and anything credential-shaped. This is why
> migration 1 must not carry all six models: SPEC §6 makes _any new persisted field that could
> carry code or secrets_ an ask-first action, and that review is meaningful on a 4-model diff and
> worthless on a 6-model one. Same rule for migrations 2 and 3.

### Slices 7–11

| #   | Slice                               | Delivers                                                                                                                 | Why here                                                                                       |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 7   | Exports history + regeneration      | Re-download by re-fetching pinned SHAs; original vs current page count shown **informationally**; graceful `source-gone` | Needs `UsedFile.commitSha` from slice 6                                                        |
| 8   | Persisted classifications (migr. 2) | Vendored overrides survive refresh                                                                                       | Slice 3 logic made durable; separate because it is a distinct NDA surface (stores globs)       |
| 9   | Neon `TreeCache` tier (migr. 3)     | First paint from DB on cold start; manual Refresh; head-SHA invalidation                                                 | Pure optimization — **no acceptance criterion depends on it**; isolating it keeps cost visible |
| 10  | Settings + GDPR                     | Repo-access link out to GitHub, full data export, account deletion                                                       | **Must be last** — it enumerates the final schema                                              |
| 11  | Marketing: landing, ToS, privacy    | `app/(marketing)/`                                                                                                       | Blocks nothing; parallelizable from slice 4 onward                                             |

> ### ▸ CHECKPOINT E — pre-launch
>
> Before the public-instance link goes into the repo description: re-run the `pg_dump` inspection
> against the final schema, exercise GDPR export and delete on a real account, confirm ToS and
> privacy are live, re-verify rate-limit behaviour on a large repo.

---

## SPEC amendments — **DONE** (applied ahead of slice 0)

All four landed in `docs/SPEC.md` before implementation started, so the spec and this plan agree:

1. ✅ The `generate.js` contract narrows to **geometry**; the typeface is an embedded Unicode mono
   font, so byte/page fidelity with the reference no longer holds.
2. ✅ Page counting is **exact via `heightOfString`** where content is in hand; the byte-size
   estimate applies only to unfetched files and is biased to over-estimate.
3. ✅ The embedded-font decision is recorded under §6 as an **approved exception**, with the reason
   and an explicit "do not restore fidelity by reverting the font".
4. ✅ §4 notes `proxy.ts` (not `middleware.ts`) and Turbopack-by-default; §3 notes Prisma 7's
   mandatory driver adapter, the two connection strings, and that `@auth/prisma-adapter` is out.

Also added while there: a boundary requiring **all GitHub calls to live in `app/api/github/*`**
with refresh in exactly one lock-guarded route handler, plus acceptance criteria for non-ASCII
rendering and for the running total matching the exported page count.

`.claude/ARCHITECTURE.md` must be updated **in the same commit** as every slice that adds, moves,
or repurposes files.

---

## Verification

**Per slice:** `npm run test && npm run typecheck && npm run lint && npm run build`, plus the
slice's own acceptance list in `docs/tasks/todo.md`.

**End to end, once slice 6 lands:** sign in on a Vercel preview → install the App on one private
repo → open it → confirm exactly one Trees call → select files across folders → confirm the
running total → export → confirm the downloaded PDF's real page count equals the displayed total →
reload the repo and confirm the exported files now show `used` → `pg_dump` and grep for source code
and credentials.
