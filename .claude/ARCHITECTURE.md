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
│   └── page.tsx             # Home page (scaffold placeholder — replace with the file-picker UI)
├── components/
│   ├── theme-provider.tsx   # next-themes wrapper + global "d" dark-mode hotkey
│   └── ui/
│       └── button.tsx       # shadcn Button (base-nova preset, @base-ui/react)
├── hooks/                   # (empty) React hooks live here
├── lib/
│   └── utils.ts             # cn() — clsx + tailwind-merge class combiner
├── public/                  # static assets served at /
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
├── package.json             # name code-excerpt-pdf, "type": module
├── skills-lock.json         # pins vendored skills (currently: shadcn)
├── .prettierrc / .prettierignore
├── .gitignore
└── generate.js              # STANDALONE CommonJS pdfkit script. Not wired into the app — it is
                             #   the VISUAL REFERENCE for the exported PDF (A4, Courier 9pt code,
                             #   Helvetica-Bold 13pt titles). The app must keep matching it.
```

## What each area is for

- **`app/`** — the Next.js 16 App Router. `layout.tsx` is the only shell; `page.tsx` is still the scaffold placeholder and is where the real UX (repo file tree with per-file page estimates + running total + export) will be built.
- **`components/ui/`** — shadcn components. Add via `npx shadcn@latest add <component>`; do not hand-write. Base is `@base-ui/react`, so custom triggers use the `render` prop, not `asChild`.
- **`components/theme-provider.tsx`** — wraps the app in next-themes and registers the global `d` hotkey (dark/light toggle, ignored while typing).
- **`lib/utils.ts`** — `cn()`; the only shared util so far.
- **`.claude/`** — Claude Code config and docs. `settings.json` is team-shared (committed); `settings.local.json` is personal and gitignored. Skills are consumed here via the symlink into `.agents/`.
- **`.agents/skills/`** — cross-agent skill store created by the `skills` CLI. Real skill files live here; `.claude/skills/*` are symlinks into it. Only `shadcn` remains (the agent-skills pack was moved to a plugin in `settings.local.json`).
- **`docs/`** — every project document lives here; the repo root stays code-only. Four roles, deliberately separate: `docs/SPEC.md` is operational and governs _how_ to build (commands, structure, data model, testing, boundaries, acceptance criteria). `docs/ideas/code-excerpt-pdf.md` records _why_ each architectural trade-off was chosen (zero-source-code storage, commit pinning, tree caching, vendored detection). `docs/tasks/plan.md` sequences the build into vertical slices with checkpoints. `docs/tasks/todo.md` is the working checklist. When SPEC and the idea doc disagree, SPEC wins on how, the idea doc wins on why.

## Notes that are easy to get wrong

- No `tailwind.config` file — Tailwind v4 is configured in `app/globals.css`.
- `generate.js` is **not** the app and must not be ported into it. It is committed for one reason only: it defines how the exported PDF must **look**. It is not a source of requirements — notably, its `.js/.jsx/.ts/.tsx` filter is incidental, while the product is language-agnostic.
- `docs/SPEC.md` is the target, not `README.md`. `README.md` is the public product pitch; the current app is still a fresh scaffold and implements none of it.
- Two constraints in `docs/SPEC.md` are non-negotiable and easy to violate by accident: **no source code or generated PDFs are ever persisted** (metadata + hashes only), and auth is a **GitHub App with `Contents: Read-only`** — never a classic OAuth App, never `scope: "repo"` (that grants write access to every private repo).
