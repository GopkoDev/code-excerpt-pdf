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
│   ├── (app)/local/page.tsx # anonymous export: drop zone + the shared SelectionPanel
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # Auth.js handlers
│       └── github/
│           ├── tree/route.ts     # one recursive=1 Trees call per repo
│           ├── blob/route.ts     # one file's content, lazily
│           ├── refresh/route.ts  # THE ONLY place a token is refreshed
│           └── setup/route.ts    # GitHub App Setup URL — idempotent
├── components/
│   ├── theme-provider.tsx   # next-themes wrapper + global "d" dark-mode hotkey
│   ├── local/
│   │   └── file-drop.tsx    # drop zone + file picker + webkitdirectory folder picker
│   ├── selection/
│   │   └── selection-panel.tsx  # THE selection UI both modes render: tree, total,
│   │                        #   preview, download. Source-agnostic on purpose
│   ├── tree/
│   │   ├── vendored-warning.tsx # warn-then-proceed dialog (never blocks)
│   │   ├── tree-view.tsx    # scrollable root list
│   │   ├── tree-node.tsx    # recursive row: tri-state checkbox, counts, estimate
│   │   ├── tree-toolbar.tsx # expand / collapse / clear
│   │   └── page-total.tsx   # running total — display only, NEVER a target input
│   ├── pdf/
│   │   ├── download-button.tsx  # saves the Blob from the shared render cache
│   │   ├── pdf-preview.tsx  # iframe over an object URL — the SAME blob
│   │   └── render.worker.ts     # THE only place pdfkit runs (classic Worker)
│   └── ui/                  # shadcn: button card empty alert badge table spinner
│                            #   separator checkbox collapsible scroll-area
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
│   │   └── installation.ts  # /user/installations → has the App been installed?
│   ├── files/
│   │   └── decode.ts        # bytes → text, or an honest reason (binary / bad UTF-8 / BOM)
│   ├── db/
│   │   ├── client.ts        # PrismaClient + PrismaNeon adapter, globalThis singleton
│   │   └── generated/       # GITIGNORED, produced by `prisma generate` (postinstall)
│   ├── uniqueness/
│   │   ├── hash.ts          # sha256Hex over RAW bytes — never post-normalization
│   │   └── status.ts        # used vs used-but-changed resolution
│   ├── sources/
│   │   ├── local.ts         # ContentSource over dropped files; LAZY reads
│   │   └── github.ts        # ContentSource over a repo; ONE Trees call, cached
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

- **`app/`** — the Next.js 16 App Router. `layout.tsx` is the only shell; `page.tsx` is still the scaffold placeholder and is where the real UX (repo file tree with per-file page estimates + running total + export) will be built.
- **`components/ui/`** — shadcn components. Add via `npx shadcn@latest add <component>`; do not hand-write. Base is `@base-ui/react`, so custom triggers use the `render` prop, not `asChild`.
- **`components/theme-provider.tsx`** — wraps the app in next-themes and registers the global `d` hotkey (dark/light toggle, ignored while typing).
- **`lib/utils.ts`** — `cn()`; the only shared util so far.
- **`components/ui/checkbox.tsx`** — the one shadcn component with a local edit: base-ui's `Checkbox.Root` has a native `indeterminate` prop and renders its indicator when *checked OR indeterminate*, so a `MinusIcon` was added beside the `CheckIcon` and swapped via `data-indeterminate`. That is the tri-state; do not rebuild it in application code.
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
- **Vendored status is derived on every render, never stored on the entry.** An override has to be able to flip it back, and a folder rule has to reach files listed later. Only `unsupported` is sticky, because it records something discovered by actually reading the file.
- **The access token must never reach the `Session` object.** `/api/auth/session` is readable by the browser, so anything on the session is public to the page. Route handlers read the raw JWT with `getToken()` instead. SPEC's "no token in any log or RSC payload" depends on this.
- **Token refresh happens in exactly one route handler**, behind `createInFlightLock`. The `jwt` callback does no network I/O: Next forbids setting cookies during render, so a token rotated there is discarded while GitHub has already invalidated the old one — the random-logout bug.
- **The two database URLs are not interchangeable.** `DATABASE_URL` is pooled and used at runtime through the Neon adapter; `DIRECT_URL` is unpooled and used by migrations, which take out advisory locks the pooler cannot hold. Pointing migrations at the pooled string looks like a hung command, not a config error.
- **Migration 1 carries four models on purpose** — `Classification` and `TreeCache` are held back. Checkpoint D reviews the migration with `pg_dump` for anything code- or credential-shaped, and that review is meaningful on a four-model diff and worthless on a six-model one.
- **Pages do not add up.** Every file measured alone rounds up to a whole page, but the export is one continuous flow, so the next file starts on the page the previous one ended. Summing per-file counts over-states the total by up to a page per file. Any aggregate — folder rows, the running total — must go through `paginate()` over the whole set, never `reduce((a, b) => a + b)`. `measure.test.ts` § "pagination is a flow, not a sum" guards this.
- **The two modes must not have two implementations.** SPEC requires GitHub mode to behave exactly like anonymous mode, so all of the state lives in `hooks/use-file-selection.ts` and all of the UI in `components/selection/selection-panel.tsx`. A page adds only what is genuinely source-specific — the drop zone, or the truncated-tree warning. Copying either into a page is how the two page counts start to disagree.
- **Preview and download share one render**, keyed by `selectionSignature()`. Rendering separately would produce two page counts free to disagree — the drift the single-run rule exists to prevent. A browser check asserts the download saves the identical `Blob` *object* the preview displayed.
- `renderPdf()` returns the page count of the run that produced the bytes. Never compute `actualPages` from a second render; the recorded number would be free to drift from the PDF the user downloaded.
- `generate.cjs` is **not** the app and must not be ported into it. It is committed for one reason only: it defines how the exported PDF must **look**. It is not a source of requirements — notably, its `.js/.jsx/.ts/.tsx` filter is incidental, while the product is language-agnostic. Its contract narrows to **geometry** (A4, 60pt margins, 9pt code, 13pt bold titles, `lineGap` 2, alphabetical, continuous flow); the typeface is deliberately different in the app, so page counts will not match. Run it as `node generate.cjs <dir>`; output lands in the gitignored `output/`.
- `docs/SPEC.md` is the target, not `README.md`. `README.md` is the public product pitch; the current app is still a fresh scaffold and implements none of it.
- Two constraints in `docs/SPEC.md` are non-negotiable and easy to violate by accident: **no source code or generated PDFs are ever persisted** (metadata + hashes only), and auth is a **GitHub App with `Contents: Read-only`** — never a classic OAuth App, never `scope: "repo"` (that grants write access to every private repo).
