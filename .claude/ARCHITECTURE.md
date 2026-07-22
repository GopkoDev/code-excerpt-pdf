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
└── generate.js              # STANDALONE prototype (CommonJS pdfkit). Not wired into the app,
                             #   not committed. Kept as a future reference example only.
```

## What each area is for

- **`app/`** — the Next.js 16 App Router. `layout.tsx` is the only shell; `page.tsx` is still the scaffold placeholder and is where the real UX (repo file tree with per-file page estimates + running total + export) will be built.
- **`components/ui/`** — shadcn components. Add via `npx shadcn@latest add <component>`; do not hand-write. Base is `@base-ui/react`, so custom triggers use the `render` prop, not `asChild`.
- **`components/theme-provider.tsx`** — wraps the app in next-themes and registers the global `d` hotkey (dark/light toggle, ignored while typing).
- **`lib/utils.ts`** — `cn()`; the only shared util so far.
- **`.claude/`** — Claude Code config and docs. `settings.json` is team-shared (committed); `settings.local.json` is personal and gitignored. Skills are consumed here via the symlink into `.agents/`.
- **`.agents/skills/`** — cross-agent skill store created by the `skills` CLI. Real skill files live here; `.claude/skills/*` are symlinks into it. Only `shadcn` remains (the agent-skills pack was moved to a plugin in `settings.local.json`).

## Notes that are easy to get wrong

- No `tailwind.config` file — Tailwind v4 is configured in `app/globals.css`.
- `generate.js` is **not** the app and is not committed; ignore it when reasoning about the product.
- The product spec in `README.md` (file tree UI, page estimates, dedupe DB) is the target — the current app is a fresh scaffold and does not implement it yet.
