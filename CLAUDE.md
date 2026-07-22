# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A tool for producing print-ready PDF listings of source code from Git repositories. The intended UX (see `README.md`): show a repo as a file tree with an estimated page count next to each file and a running total, let the user pick files until the total hits a target length, then export a paginated PDF. Everything exported is recorded so already-published files are locked out of future listings — no fragment ever appears twice.

The web app (this Next.js project) is where that UX is being built. `generate.js` at the repo root is a standalone example/prototype (a CommonJS pdfkit script) — it is not wired into the app and not the source of truth for how the product works.

## Commands

```bash
npm run dev        # Next.js dev server (Turbopack)
npm run build      # production build — also runs full TypeScript check
npm run typecheck  # tsc --noEmit, standalone type check
npm run lint       # eslint (flat config, eslint-config-next)
npm run format     # prettier --write on all .ts/.tsx
```

No test runner is configured yet.

## Framework versions — read before writing code

This is **Next.js 16 + React 19**, which have breaking changes from older training data. `AGENTS.md` warns: read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code, and heed deprecation notices. Don't assume App Router / RSC conventions from memory.

## shadcn / UI conventions

- **Component base is `@base-ui/react`, not Radix.** For custom triggers use the `render` prop, **not** `asChild`. The `shadcn` skill (`.agents/skills/shadcn/`) auto-loads and carries the full enforced rule set — consult it before building UI.
- **Style preset is `base-nova`** (`components.json`), base color `neutral`, icon library `lucide`.
- **Add components via the CLI, don't hand-write them:** `npx shadcn@latest add <component>`. Use `npx shadcn@latest search` / `docs <component>` to discover and read docs.
- **Tailwind v4** — configured entirely in `app/globals.css` (`@import "tailwindcss"` + `@theme`), there is **no `tailwind.config` file**. Use semantic color tokens (`bg-primary`, `text-muted-foreground`), never raw colors or manual `dark:` overrides. Use `cn()` from `@/lib/utils` for conditional classes.
- Path alias: `@/*` → repo root (e.g. `@/components/ui/button`, `@/lib/utils`).

## Formatting

Prettier config (`.prettierrc`) is opinionated and enforced: **no semicolons**, double quotes, 2-space, `printWidth` 80, `trailingComma: es5`, plus `prettier-plugin-tailwindcss` (auto-sorts class names). A Claude Code `PostToolUse` hook in `.claude/settings.json` runs Prettier on every file you Write/Edit, so files are formatted automatically — match that style when authoring.

## Theming

`app/layout.tsx` wraps the app in `ThemeProvider` (`components/theme-provider.tsx`), built on `next-themes` with `attribute="class"` and system default. The provider also registers a global **`d` hotkey** that toggles dark/light (ignored while typing in inputs). Fonts: Oxanium as `--font-sans`, Geist Mono as `--font-mono`.
