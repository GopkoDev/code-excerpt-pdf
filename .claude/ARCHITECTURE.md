# ARCHITECTURE.md

Living map of the repository, maintained **primarily for Claude Code**. Keep it in sync with reality: whenever a commit adds, removes, moves, or repurposes a file, update the tree and the "purpose" note in the same commit. If this doc and the code disagree, the code wins — fix the doc.

Last structural review: 2026-07-23.

## File tree (source of truth = the repo, not this list)

```
code-excerpt-pdf/
├── app/                     # Next.js App Router
│   ├── favicon.ico
│   ├── globals.css          # Tailwind v4 entry + @theme tokens (no tailwind.config file)
│   ├── layout.tsx           # Root layout: fonts, ThemeProvider, <html>/<body>
│   ├── page.tsx             # Home page (scaffold placeholder — replace with the file-picker UI)
│   ├── (app)/
│   │   ├── layout.tsx       # authenticated shell: header, sign in/out, nav.
│   │   │                    #   Reads the session but never gates — /local is anonymous
│   │   ├── local/page.tsx   # anonymous export: drop zone + the shared SelectionPanel
│   │   ├── exports/page.tsx # past exports; session gate only, list is client-side
│   │   ├── settings/
│   │   │   ├── page.tsx     # repo-access link out, data export, account deletion.
│   │   │   │                #   No GitHub call and no database read of its own
│   │   │   └── actions.ts   # "use server": THE account-deletion action. Deletes,
│   │   │                    #   then signs out — one step, because the cookie must go
│   │   └── projects/
│   │       ├── page.tsx     # repo picker; install CTA when nothing is installed
│   │       └── [repoId]/page.tsx  # parses the id, checks the session, renders the workspace
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # Auth.js handlers
│       ├── account/
│       │   └── export/route.ts  # GDPR subject-access request: every row, as a
│       │                    #   downloadable JSON file. Attachment, no-store
│       ├── exports/
│       │   ├── route.ts       # POST records an export, GET lists them
│       │   └── used/route.ts  # the ledger for one repo — no GitHub call
│       ├── classifications/route.ts  # GET/POST manual vendored overrides for one repo.
│       │                    #   Our own database only — no GitHub call
│       └── github/
│           ├── repos/route.ts    # installations → the repos each one can reach
│           ├── tree/route.ts     # one recursive=1 Trees call per repo — or none,
│           │                      #   on a TreeCache hit. ?refresh=1 bypasses it
│           ├── blob/route.ts     # one file's content, lazily
│           ├── refresh/route.ts  # THE ONLY place a token is refreshed
│           └── setup/route.ts    # GitHub App Setup URL — idempotent
├── components/
│   ├── theme-provider.tsx   # next-themes wrapper + global "d" dark-mode hotkey
│   ├── auth/
│   │   └── auth-buttons.tsx # sign in / out as Server Actions (they write cookies)
│   ├── projects/
│   │   ├── repo-list.tsx    # client list off /api/github/repos + install CTA
│   │   ├── repo-stats.tsx   # share of the repo's volume already filed — no API call
│   │   └── repo-workspace.tsx   # loads the cached GitHub source into SelectionPanel,
│   │                        #   loads the export ledger, records a finished export
│   ├── exports/
│   │   ├── exports-list.tsx # GET /api/exports, newest first. ZERO GitHub calls
│   │   └── export-card.tsx  # one export + the rebuild: re-fetch pinned SHAs, render,
│   │                        #   report original vs current pages INFORMATIONALLY
│   ├── local/
│   │   └── file-drop.tsx    # drop zone + file picker + webkitdirectory folder picker
│   ├── settings/
│   │   └── delete-account-dialog.tsx  # type-the-login confirmation. A HINT only —
│   │                        #   the same rule is enforced in the Server Action
│   ├── selection/
│   │   └── selection-panel.tsx  # THE selection UI both modes render: tree, total,
│   │                        #   preview, download. Source-agnostic on purpose
│   ├── tree/
│   │   ├── selection-warning.tsx # warn-then-proceed dialog for BOTH vendored and
│   │   │                    #   already-used files (never blocks either)
│   │   ├── tree-view.tsx    # scrollable root list
│   │   ├── tree-node.tsx    # recursive row: tri-state checkbox, counts, estimate
│   │   ├── tree-toolbar.tsx # expand / collapse / clear
│   │   └── page-total.tsx   # running total — display only, NEVER a target input
│   ├── pdf/
│   │   ├── download-button.tsx  # saves the Blob from the shared render cache
│   │   ├── pdf-preview.tsx  # iframe over an object URL — the SAME blob
│   │   └── render.worker.ts     # THE only place pdfkit runs (classic Worker)
│   └── ui/                  # shadcn: button card empty alert badge table spinner
│                            #   separator checkbox collapsible scroll-area switch
│                            #   alert-dialog progress skeleton field input label
├── hooks/
│   ├── use-pdf-worker.ts    # owns the worker, turns postMessage into promises
│   └── use-file-selection.ts # ALL state between a ContentSource and a PDF —
│                            #   shared by anonymous mode and GitHub mode
├── lib/
│   ├── utils.ts             # cn() — clsx + tailwind-merge class combiner
│   ├── utils.test.ts        # cn() unit test; also GUARDS that `@/*` resolves under Vitest
│   ├── github/
│   │   ├── client.ts        # THE only fetch to api.github.com + error mapping
│   │   ├── errors.ts        # typed kinds; safeMessage redacts anything token-shaped
│   │   ├── tree.ts          # Zod-validated Trees response; surfaces `truncated`
│   │   ├── blob.ts          # base64 → raw bytes, refuses non-inlined blobs
│   │   ├── concurrency.ts   # queue capping parallel fetches (secondary limits)
│   │   ├── session-token.ts # getToken() — the only way a route reads the token
│   │   ├── refresh-lock.ts  # in-flight map — stops parallel refreshes racing
│   │   ├── installation.ts  # /user/installations → has the App been installed?
│   │   ├── repos.ts         # Zod-validated installations + repositories responses
│   │   ├── repo-id.ts       # `owner_repo` URL segment ⇄ parts, and the shape guards
│   │   │                    #   the route handlers use before touching an API path
│   │   └── refreshing-fetch.ts  # client side of the 401 contract: refresh once,
│   │                        #   retry once, single-flight. THE app's browser fetcher
│   ├── files/
│   │   └── decode.ts        # bytes → text, or an honest reason (binary / bad UTF-8 / BOM)
│   ├── db/
│   │   ├── client.ts        # getPrisma(): PrismaNeon adapter, globalThis singleton,
│   │   │                    #   built LAZILY so importing it opens no connection
│   │   ├── exports.ts       # THE persistence port: every DB call the app makes,
│   │   │                    #   taking the client as a parameter
│   │   ├── exports.test.ts  # proves the port against an in-memory fake — no database
│   │   ├── exports-db.ts    # the real ExportsDb: Prisma narrowed to the port
│   │   ├── classifications.ts       # the persistence port for manual vendored overrides,
│   │   │                    #   plus the trailing-slash codec for ManualOverride.scope
│   │   ├── classifications.test.ts  # same in-memory-fake pattern, no database
│   │   ├── classifications-db.ts    # the real ClassificationsDb adapter
│   │   ├── tree-cache.ts    # the listing cache port + the Zod schema that is the
│   │   │                    #   ONLY thing allowed into the `tree` Json column
│   │   ├── tree-cache.test.ts       # TTL, head-move replacement, NDA key set
│   │   ├── tree-cache-db.ts # the real TreeCacheDb adapter
│   │   ├── account.ts       # THE GDPR pair: full data export + account deletion.
│   │   │                    #   ACCOUNT_MODELS is the complete model inventory
│   │   ├── account.test.ts  # pins that inventory to prisma/schema.prisma, so a
│   │   │                    #   SEVENTH MODEL fails the suite instead of vanishing
│   │   ├── account-db.ts    # the real AccountDb adapter
│   │   └── generated/       # GITIGNORED, produced by `prisma generate` (postinstall)
│   ├── account/
│   │   ├── payload.ts       # the typed-confirmation rule for deletion, enforced
│   │   │                    #   server-side — the dialog is only the polite half
│   │   └── payload.test.ts
│   ├── classifications/
│   │   └── payload.ts       # Zod schema for POST /api/classifications — the second
│   │                        #   write path, guarded exactly like the first
│   ├── exports/
│   │   ├── payload.ts       # Zod schema for POST /api/exports — the ONLY shape a
│   │   │                    #   browser can push into the database
│   │   └── regenerate.ts    # re-fetches a past export at its PINNED commit SHAs,
│   │                        #   one Trees call per distinct SHA. Never at HEAD
│   ├── uniqueness/
│   │   ├── hash.ts          # sha256Hex over RAW bytes — never post-normalization
│   │   ├── status.ts        # used vs used-but-changed resolution
│   │   └── stats.ts         # share of a project's volume already filed
│   ├── sources/
│   │   ├── local.ts         # ContentSource over dropped files; LAZY reads
│   │   ├── github.ts        # ContentSource over a repo; ONE Trees call, cached.
│   │   │                    #   refresh() is GitHub-only, deliberately off the seam
│   │   └── github-cache.ts  # module-scoped instances, so a remount reuses that call
│   ├── vendored/
│   │   ├── types.ts         # Layer, Verdict, ManualOverride
│   │   ├── glob.ts          # small gitignore-subset matcher (no dependency)
│   │   ├── structural.ts    # node_modules, dist, lockfiles — lowest precedence
│   │   ├── gitattributes.ts # linguist-vendored / -generated, and negations
│   │   ├── plugins/shadcn.ts# components.json → aliases.ui
│   │   └── index.ts         # THE precedence resolver, evaluated per query
│   ├── tree/
│   │   ├── types.ts         # FileEntry, TreeNode, ContentSource — THE source-agnostic seam
│   │   ├── build.ts         # flat paths → nested tree, with folder aggregates
│   │   └── selection.ts     # tri-state, bulk folder select with skip counts
│   └── pdf/
│       ├── constants.ts     # THE visual contract — geometry, fonts, TEXT_FEATURES.
│       │                    #   Changing geometry here is ask-first (SPEC §6)
│       ├── measure.ts       # exact line counts (pdfkit's wrapper) + arithmetic paginator
│       ├── measure.test.ts  # proves the paginator == pdfkit's own page count
│       ├── estimate.ts      # size-only page estimate for UNFETCHED files, biased high
│       ├── render.ts        # drawFiles() = the ONLY draw loop; renderPdf() → blob+count
│       ├── render.test.ts   # single-run page count, alphabetical order, raw-byte hashing
│       └── worker-protocol.ts   # message types shared by the page and the worker
├── prisma/
│   ├── schema.prisma        # THE complete inventory of what is persisted, with the
│   │                        #   NDA constraint restated on every model
│   ├── migrations/          # hand-placed, generated OFFLINE by `prisma migrate diff
│   │                        #   --script`. NONE has been applied to a database yet
│   │   ├── migration_lock.toml
│   │   ├── 20260723120000_init/   # User, Repo, Export, UsedFile — four models, on purpose
│   │   ├── 20260723120100_add_classification/  # Classification alone (slice 8)
│   │   └── 20260723120200_add_tree_cache/      # TreeCache alone (slice 9)
│   └── migrations.test.ts   # reads the checked-in SQL: one concern per migration,
│                            #   and no column that could hold code or a credential
├── scripts/
│   └── copy-pdfkit.mjs      # postinstall: node_modules/pdfkit/js/pdfkit.standalone.js
│                            #   → public/vendor/ (loaded by a Web Worker at runtime)
├── public/                  # static assets served at /
│   ├── fonts/               # COMMITTED: JetBrains Mono Regular + Bold (OFL.txt), full,
│   │                        #   not subset — the embedded Unicode mono family
│   └── vendor/              # GITIGNORED, generated by the postinstall script above
├── .claude/
│   ├── ARCHITECTURE.md      # this file — the living project map
│   ├── settings.json        # committed: permissions, prettier hook, commit attribution
│   ├── settings.local.json  # GITIGNORED, personal: enabled plugins (context7, agent-skills)
│   └── skills/shadcn        # symlink → ../../.agents/skills/shadcn
├── .agents/skills/shadcn/   # vendored shadcn skill (real files; .claude/skills symlinks here)
├── docs/                    # ALL project docs live here (nothing doc-shaped at the repo root)
│   ├── SPEC.md              # HOW to build it: objective, structure, style, tests, boundaries
│   ├── ideas/
│   │   └── code-excerpt-pdf.md  # refined idea one-pager: WHY each design decision was made
│   └── tasks/
│       ├── plan.md          # build plan: findings, vertical slices, checkpoints
│       └── todo.md          # actionable checklist, acceptance criteria per slice
├── AGENTS.md                # scaffold note: "this is not the Next.js you know"
├── CLAUDE.md                # primary guidance for Claude Code (read first)
├── README.md               # product vision, trilingual (EN/UA/PL)
├── components.json          # shadcn config: style base-nova, base color neutral, lucide icons
├── eslint.config.mjs        # flat config, eslint-config-next
├── next.config.ts           # Next config (currently empty)
├── postcss.config.mjs       # @tailwindcss/postcss
├── tsconfig.json            # strict TS, @/* → repo root
├── vitest.config.ts         # Vitest: node env, *.test.ts, resolve.tsconfigPaths for @/*
├── package.json             # name code-excerpt-pdf, "type": module
├── skills-lock.json         # pins vendored skills (currently: shadcn)
├── .prettierrc / .prettierignore
├── .gitignore
└── generate.cjs             # STANDALONE CommonJS pdfkit script. Not wired into the app — it is
                             #   the VISUAL REFERENCE for the exported PDF (A4, Courier 9pt code,
                             #   Helvetica-Bold 13pt titles). The app must keep matching it.
```

## What each area is for

- **`app/`** — the Next.js 16 App Router. `app/layout.tsx` carries fonts and the theme; `app/(app)/layout.tsx` is the authenticated shell (header, sign in/out, nav) that anonymous mode also renders under. `app/page.tsx` is still the scaffold placeholder.
- **`app/(app)/projects/`** — GitHub mode. `page.tsx` picks a repository, `[repoId]/page.tsx` opens one. Neither talks to GitHub: they resolve the session and hand off to a client component that goes through `app/api/github/*`.
- **`components/ui/`** — shadcn components. Add via `npx shadcn@latest add <component>`; do not hand-write. Base is `@base-ui/react`, so custom triggers use the `render` prop, not `asChild`.
- **`components/theme-provider.tsx`** — wraps the app in next-themes and registers the global `d` hotkey (dark/light toggle, ignored while typing).
- **`lib/db/` + `lib/exports/` + `lib/classifications/`** — persistence, kept deliberately thin. `exports.ts` and `classifications.ts` are _ports_: each receives the Prisma client as a parameter, so every rule they encode (a repo row is reused, one `UsedFile` per file, one rule per path, a ledger never crosses users) is proven against an in-memory fake with no database anywhere. `exports-db.ts` and `classifications-db.ts` are the only adapters that hand them the real client. Nothing else in the app imports Prisma. Both share `UsersDb`, because `User` is identity and belongs to neither.
- **`app/(app)/settings/` + `lib/db/account.ts`** — the GDPR pair. `exportAccountData` hands over every row the service holds; `deleteAccount` erases them. Both iterate `ACCOUNT_MODELS`, the written-down inventory of persisted models, which `lib/db/account.test.ts` compares against `prisma/schema.prisma` itself — so a seventh model fails the suite rather than falling silently out of a subject-access request. Built last for exactly that reason: enumerating a schema that is still growing is how a table ends up outside the export.
- **`lib/utils.ts`** — `cn()`; the only shared util so far.
- **`components/ui/checkbox.tsx`** — the one shadcn component with a local edit: base-ui's `Checkbox.Root` has a native `indeterminate` prop and renders its indicator when _checked OR indeterminate_, so a `MinusIcon` was added beside the `CheckIcon` and swapped via `data-indeterminate`. That is the tri-state; do not rebuild it in application code.
- **`app/(app)/local/`** — anonymous mode: drop files, see exact line counts and a running page total, download. No account, no network, nothing persisted. The page itself is now only the drop zone plus `SelectionPanel`; everything else lives in `useFileSelection`, which GitHub mode drives identically.
- **Testing** — Vitest, `node` environment, no jsdom (add it only when a slice actually needs a component test). Tests are co-located as `*.test.ts` next to the module they cover. Run with `npm test` / `npm run test:watch`.
- **`scripts/`** — build-time Node scripts, plain `.mjs`, outside the Next.js graph.
- **`.claude/`** — Claude Code config and docs. `settings.json` is team-shared (committed); `settings.local.json` is personal and gitignored. Skills are consumed here via the symlink into `.agents/`.
- **`.agents/skills/`** — cross-agent skill store created by the `skills` CLI. Real skill files live here; `.claude/skills/*` are symlinks into it. Only `shadcn` remains (the agent-skills pack was moved to a plugin in `settings.local.json`).
- **`docs/`** — every project document lives here; the repo root stays code-only. Four roles, deliberately separate: `docs/SPEC.md` is operational and governs _how_ to build (commands, structure, data model, testing, boundaries, acceptance criteria). `docs/ideas/code-excerpt-pdf.md` records _why_ each architectural trade-off was chosen (zero-source-code storage, commit pinning, tree caching, vendored detection). `docs/tasks/plan.md` sequences the build into vertical slices with checkpoints. `docs/tasks/todo.md` is the working checklist. When SPEC and the idea doc disagree, SPEC wins on how, the idea doc wins on why.

## Notes that are easy to get wrong

- No `tailwind.config` file — Tailwind v4 is configured in `app/globals.css`.
- **pdfkit is never imported as a module.** It is vendored as `public/vendor/pdfkit.standalone.js` and loaded by a Web Worker at runtime, so `next.config.ts` can stay empty (Next 16 builds with Turbopack, which cannot use pdfkit's webpack recipe). The copy is gitignored and regenerated on every `npm install`; edit `scripts/copy-pdfkit.mjs`, never the copy. It is excluded from ESLint and Prettier.
- **Never render or measure text without `TEXT_FEATURES` from `lib/pdf/constants.ts`.** JetBrains Mono's programming ligatures (`calt`) make fontkit throw `RangeError: Offset is outside the bounds of the DataView` on `//`, `=>`, `!=`, `<=`, `===`, `->` — i.e. on almost any real source file. Passing an empty feature array does **not** help; each feature must be disabled by name.
- The font is deliberately **not subset**. Subsetting saves only ~31% (35 KB/weight) and reintroduces the `.notdef` risk the embedded font exists to eliminate — and `.notdef` corrupts the page count, not just the looks.
- `lib/pdf/measure.ts` must not import pdfkit. The document is injected so the same code runs in the Web Worker (where `PDFDocument` is a global from the standalone build) and in Vitest under Node.
- The worker must stay a **classic** worker (`new Worker(new URL("./x.worker.ts", import.meta.url))` with no `{ type: "module" }`). Module workers have no `importScripts`, which is the only way to load the UMD standalone bundle. Turbopack transpiles it into its own chunk plus a `turbopack-worker-*.js` bootstrap; the raw `.ts` that also appears under `.next/static/media/` is an unused side-effect of the `new URL()` asset reference — it is served as `video/mp2t` and nothing loads it.
- `doc.bufferedPageRange().count` is **1 unless the document was created with `bufferPages: true`**. Any test using it as ground truth is silently wrong without that flag. `renderPdf()` throws rather than let this pass unnoticed.
- **`drawFiles()` in `lib/pdf/render.ts` is the only place the flow is drawn.** `measure.test.ts` validates its paginator against that function, not against a copy — so measurement and rendering cannot drift apart.
- **A folder showing `~33p` before selection and `28p` after is correct, not a bug — do not "fix" it by measuring eagerly.** Exact counts need file content. Anonymous mode has it, but GitHub mode does not: fetching every blob just to label a tree is the API spend the two-tier design exists to avoid. Measuring everything up front in anonymous mode would also stop exercising the byte estimator on the main path, which is the only thing keeping it calibrated for GitHub mode. The estimate stays, and the `~` prefix is what makes it honest. Decision confirmed with the user 2026-07-23.
- **A file that fails to decode must get `status: "unsupported"`, not just be deselected.** A listing knows only names and sizes, so a binary like `.DS_Store` is `available` until something reads it. If it stays `available` after failing, the next bulk select re-adds it, it fails again, and its folder can never reach "all" — it sits indeterminate and re-reports the same error on every click. `lib/tree/selection.ts` skips the status and counts it separately.
- **A re-download re-lists the repository at the PINNED commit SHA, never at HEAD.** Re-listing at HEAD would quietly rebuild a different document under the same date — which is exactly the doubt the ledger exists to remove. `collectPinnedFiles` issues one Trees call per _distinct_ pinned SHA, so an export taken in one sitting costs one call plus one blob per file.
- **`source-gone` is a permanent verdict, so it must not swallow a temporary failure.** A 404 on the pinned tree means the repository or the revision is gone and the user is sent to their emailed copy; a 429, a 403 or an outage throws instead, because sending someone to their email for something that will work again in a minute is worse than an error. Deleted individual files and hash mismatches are neither — they are reported and the rest is still rebuilt.
- **Original versus rebuilt page count is shown, never enforced.** A difference means the repository moved on. SPEC is explicit that this is informational; gating a re-download on it would make an old export undownloadable exactly when the user needs it most.
- **`used` is derived exactly like `vendored` — per render, from the ledger, never written onto the entry.** `useFileSelection` applies the vendored resolver first and `resolveStatuses` second, and `resolveStatuses` only ever touches an `available` file: a vendored or unreadable file has been decided on other grounds, and stacking `used` on top would hide why it is unselectable.
- **A missing content hash means "assume unchanged", not "unknown".** Only a fetched file can be told apart from the one that was filed, and in GitHub mode most files are never fetched. `resolveStatuses` resolves those to `used` rather than `available`, because a used file silently re-entering a listing is the one failure the product exists to prevent — and the user can still select it deliberately, with a warning.
- **A used file is marked and warned about, never disabled.** The checkbox still works. `components/tree/selection-warning.tsx` is the same dialog vendored files use, because SPEC forbids hard-blocking in both cases and two dialogs would have drifted apart.
- **The export is recorded _after_ the blob is saved, never before.** Recording first would lock files out of every future listing for a PDF nobody actually has. `DownloadButton` calls `onExported` only once `saveBlob` has run, and `actualPages` is the page count of that same render — never a second one.
- **Vendored status is derived on every render, never stored on the entry.** An override has to be able to flip it back, and a folder rule has to reach files listed later. Only `unsupported` is sticky, because it records something discovered by actually reading the file.
- **`app/(app)/layout.tsx` calls `auth()`, which makes every page under it dynamic — including `/local`.** That is the price of a session-aware header, not a mistake. What it must never become is a gate: anonymous mode is required to work with no account at all, so only the pages that actually read GitHub check for a session.
- **`auth()` fails with `UntrustedHost` on any host Auth.js cannot infer** — a production build on a port other than 3000, a container, a proxy. It does not throw the page away, it just renders everything as signed out, which reads as a login bug. `AUTH_TRUST_HOST=true` fixes it; Vercel is detected automatically. Noted in `.env.example`.
- **The `[repoId]` segment is `owner_repo`, split at the FIRST underscore.** A GitHub login may only hold alphanumerics and hyphens, so that split is unambiguous even though repository names may contain underscores. A slash cannot be used: Next reads it as two segments and `%2F` gets normalised away in transit. `parseRepoId` returns `null` for anything malformed, and the route handlers refuse the same shapes — both halves end up inside a GitHub API path, where a `/` or a `..` would address a different endpoint.
- **The access token must never reach the `Session` object.** `/api/auth/session` is readable by the browser, so anything on the session is public to the page. Route handlers read the raw JWT with `getToken()` instead. SPEC's "no token in any log or RSC payload" depends on this.
- **A `ContentSource` for a repository lives in module scope, not in React state.** SPEC: navigating away from a repo and back in the same session issues zero further GitHub calls — but navigating remounts the page, and a source built in the component would repeat the Trees call. `lib/sources/github-cache.ts` holds the instances; the source _is_ the cache, so no query library wraps it. **No React Query was added**: nothing left for it to cache, and it would have been a second place for the same truth to live.
- **The repository page fetches `.gitattributes` and `components.json` on open** (one blob call each, only if the tree lists them). Vendored detection needs them, and they are the same two files anonymous mode reads. It is a deliberate two-request cost per repo, not a leak in the "content only for selected files" rule.
- **Token refresh happens in exactly one route handler**, behind `createInFlightLock`. The client half is `lib/github/refreshing-fetch.ts`: it recognises `401 token-expired`, posts to that one route, and retries once — with a single-flight promise, because selecting a folder fires several blob reads at once and GitHub's refresh tokens are single-use. The `jwt` callback does no network I/O: Next forbids setting cookies during render, so a token rotated there is discarded while GitHub has already invalidated the old one — the random-logout bug.
- **`Classification` has no `scope` column, and that is deliberate.** `ManualOverride` distinguishes a file rule from a folder rule, but SPEC §3 gives the model three fields — and both hold, because `pathOrGlob` is a _glob_: a folder rule is stored with a trailing slash (`components/ui/`), which is the gitignore convention `lib/vendored/glob.ts` already implements, and a file rule is the bare path. The codec is `toPathOrGlob`/`toOverride` in `lib/db/classifications.ts`. Adding a column instead would have been a second encoding of something the pattern language already expresses.
- **A stored override deliberately records no hash and no size.** That absence is what makes it survive a content change: an override keyed on `contentHash` would be silently discarded the moment the file was edited, which is exactly what SPEC's acceptance criterion says must not happen. `lib/db/classifications.test.ts` asserts the row's key set, so adding one fails the suite.
- **Overrides are written through, not batched.** `useFileSelection` applies the change locally and _then_ reports it via `onOverrideChange`; `RepoWorkspace` posts it and names a failure in a banner rather than rolling the checkbox back under the user. Making the click await a round trip would slow the common case to tidy up the rare one — but a silently unsaved override is worse than a slow one, so it is never swallowed.
- **Nothing outside `lib/db/exports-db.ts` and `lib/db/classifications-db.ts` may import Prisma.** Every query goes through a port (`lib/db/exports.ts`, `lib/db/classifications.ts`), which takes the client as a parameter — that is what makes the ledger's rules testable with no database at all, and it keeps the complete inventory of persisted fields readable in one file. `const db: ExportsDb = prisma` does **not** compile: Prisma's methods are generic (`SelectSubset<T, …>`) and a generic signature is not assignable to a concrete one. The adapter writes the calls out instead, which is what actually type-checks the port against the generated client — if the schema and the port drift, that file stops compiling.
- **The tree is cached in two tiers, and only the first one is required.** `lib/sources/github-cache.ts` holds the answer for as long as the tab lives — that is what the "zero further GitHub calls" criterion rests on. `TreeCache` is the second tier and covers only what the first cannot: a new tab, a new device, a cold lambda. It is a **pure optimisation, and no acceptance criterion depends on it**; every part of it fails soft, so a database that is slow, absent or unreadable costs one Trees call and nothing else.
- **A cache hit is served without asking GitHub what the head SHA is now.** That is the entire saving, and it is also why `TREE_CACHE_TTL_MS` exists: `{repoId}@{headSha}` invalidates the row when a _fetch_ discovers a new head, but nothing discovers it while the cache is being read. The TTL bounds the staleness; the Refresh button is the escape hatch, and it costs exactly one Trees call, which is why it is a button rather than something the page does on its own.
- **A request pinned to a commit SHA is never cached and never overwrites the cache.** Those come from `lib/exports/regenerate.ts`, which must re-list a past export at exactly that revision. Serving it the HEAD listing would rebuild a different document under the same date — the doubt the ledger exists to remove.
- **`refresh()` is on the GitHub source, not on `ContentSource`.** Anonymous mode has nothing to refresh, and widening the seam that keeps the two modes identical for the benefit of one of them is how they start to drift. It sits beside `isTruncated()` and `headSha()` for the same reason. It also drops cached **blobs**, because a new head means a path can point at different bytes.
- **Caching a listing creates the `Repo` row.** `TreeCache.repoId` is a foreign key, so merely _opening_ a repository now writes one — where before a row appeared only on an export or an override. The database therefore learns which repositories were looked at, not only which were exported from. Stated here because it is exactly the kind of thing a `pg_dump` review should already know about rather than discover.
- **`readAccessToken` returns `githubId`/`githubLogin` as well as the token.** Both are already on the JWT, and the tree route needs a `userId` on its hottest path; a second `auth()` call would decrypt the same cookie twice. Still nothing new on the `Session` — this is the raw JWT, which the browser cannot read.
- **`Repo` is identified by `(userId, owner, name)`, not by `githubRepoId`** — a documented deviation from SPEC §3, argued at the bottom of `prisma/schema.prisma`. Nothing in the app ever holds the numeric id for free, and filling it would put a `GET /repos/{owner}/{repo}` on a path SPEC requires to cost no GitHub call. The trade: a renamed repository starts a fresh ledger.
- **The access token is still not on the `Session`, but `githubId` and `githubLogin` now are.** Both are public information (a profile URL resolves to the id), and the export routes need an identity. Auth.js puts _no_ id on `session.user` under the JWT strategy — verified in `@auth/core/lib/actions/session.js`, which builds `user` from `name`/`email`/`picture` only — so it is carried explicitly.
- **The `signIn` callback's `User` upsert is allowed to fail silently.** A database hiccup must not cost a sign-in: anonymous mode needs no account and reading a repository needs no row. `POST /api/exports` upserts again before recording, so the row is self-healing. Nothing is logged there either — the error could carry the connection string.
- **The two database URLs are not interchangeable.** `DATABASE_URL` is pooled and used at runtime through the Neon adapter; `DIRECT_URL` is unpooled and used by migrations, which take out advisory locks the pooler cannot hold. Pointing migrations at the pooled string looks like a hung command, not a config error.
- **Migration 1 carries four models on purpose** — `Classification` and `TreeCache` are held back. Checkpoint D reviews the migration with `pg_dump` for anything code- or credential-shaped, and that review is meaningful on a four-model diff and worthless on a six-model one. `prisma/migrations.test.ts` enforces it, so collapsing them back together fails the suite rather than merely contradicting a comment.
- **The migration SQL was produced offline and no migration has ever run.** The user declined to have a database touched, so `prisma migrate dev` was never invoked. Each folder was written with `npx prisma migrate diff --from-schema <previous state> --to-schema prisma/schema.prisma --script`, chaining snapshots of the schema rather than diffing against a live database — which is the only way to get _separate_ migrations with nothing to apply them to. `migrate diff` is read-only and needs no connection. What that leaves unproven: the SQL has never executed, so nothing here is evidence that it applies cleanly.
- **Pages do not add up.** Every file measured alone rounds up to a whole page, but the export is one continuous flow, so the next file starts on the page the previous one ended. Summing per-file counts over-states the total by up to a page per file. Any aggregate — folder rows, the running total — must go through `paginate()` over the whole set, never `reduce((a, b) => a + b)`. `measure.test.ts` § "pagination is a flow, not a sum" guards this.
- **The two modes must not have two implementations.** SPEC requires GitHub mode to behave exactly like anonymous mode, so all of the state lives in `hooks/use-file-selection.ts` and all of the UI in `components/selection/selection-panel.tsx`. A page adds only what is genuinely source-specific — the drop zone, or the truncated-tree warning. Copying either into a page is how the two page counts start to disagree.
- **Preview and download share one render**, keyed by `selectionSignature()`. Rendering separately would produce two page counts free to disagree — the drift the single-run rule exists to prevent. A browser check asserts the download saves the identical `Blob` _object_ the preview displayed.
- `renderPdf()` returns the page count of the run that produced the bytes. Never compute `actualPages` from a second render; the recorded number would be free to drift from the PDF the user downloaded.
- **The GDPR export and delete are pinned to `prisma/schema.prisma`, not to a list someone remembered to update.** `lib/db/account.test.ts` parses the schema for its model names _and each model's columns_, and compares both against what `exportAccountData` actually produces — so adding a seventh model, or a seventh column to an existing model, fails eight tests instead of quietly narrowing a subject-access request. `AccountDeletion` is `Record<AccountModel, number>` for the same reason at compile time: a new model stops `lib/db/account.ts` compiling until it is genuinely deleted.
- **Account deletion does not trust the foreign keys.** Every relation declares `onDelete: Cascade`, so `user.delete` alone would probably suffice — but no migration in this repository has ever been applied, so that cascade has never once been observed, and "the FK will handle it" is not an answer to a regulator. `deleteAccount` deletes each table explicitly, children before parents, and the in-memory fake implements **no** cascade at all, which is what makes the test evidence rather than a restatement. If the real cascade also fires, it finds nothing left to do.
- **Deletion is deliberately not wrapped in a transaction, and the delete order is the safety property.** Children first means an interrupted deletion leaves an intact account holding less data — never an orphaned row whose owner is gone, and never a user told they are deleted while their paths remain. It is idempotent, so the fix for a half-finished run is to run it again. (Nothing here has ever exercised an interactive transaction against the Neon adapter; when one is first proven to work, wrapping this is a safe upgrade.)
- **Deletion is a Server Action, not a route handler, because the session cookie has to go in the same step.** A JWT still naming a deleted account would keep the user browsing as a ghost, and the very next export would upsert the `User` row back into existence. Writing a cookie is legal only in a Server Action or a route handler, and the confirmation had to be enforced somewhere a client cannot skip — so `app/(app)/settings/actions.ts` deletes and then `signOut`s, and re-reads the identity from the session rather than trusting the form.
- **The data export re-validates `TreeCache.tree` on the way out, through the same Zod schema that guarded it on the way in.** It is the only Json column in the schema and therefore the only value in the export whose shape the type system does not already know. A subject-access request must not become the one path that hands back whatever happens to be sitting in that column.
- **Deleting an account erases the uniqueness ledger, so previously exported files become selectable again.** That is correct — the record that they were used no longer exists, and keeping it would be keeping personal data after an erasure request — but it is the kind of consequence a user should be told about rather than discover, so the dialog says it.
- `generate.cjs` is **not** the app and must not be ported into it. It is committed for one reason only: it defines how the exported PDF must **look**. It is not a source of requirements — notably, its `.js/.jsx/.ts/.tsx` filter is incidental, while the product is language-agnostic. Its contract narrows to **geometry** (A4, 60pt margins, 9pt code, 13pt bold titles, `lineGap` 2, alphabetical, continuous flow); the typeface is deliberately different in the app, so page counts will not match. Run it as `node generate.cjs <dir>`; output lands in the gitignored `output/`.
- `docs/SPEC.md` is the target, not `README.md`. `README.md` is the public product pitch; the current app is still a fresh scaffold and implements none of it.
- Two constraints in `docs/SPEC.md` are non-negotiable and easy to violate by accident: **no source code or generated PDFs are ever persisted** (metadata + hashes only), and auth is a **GitHub App with `Contents: Read-only`** — never a classic OAuth App, never `scope: "repo"` (that grants write access to every private repo).
