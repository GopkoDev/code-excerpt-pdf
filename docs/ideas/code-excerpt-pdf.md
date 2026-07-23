# code-excerpt-pdf

## Problem Statement

**How might we** turn the recurring prep of a "proof-of-authorship" code PDF (submitted to
claim the reduced tax rate / authorial-cost deduction) into a few minutes of work — so that
(a) the user can see the page count accumulate as he picks files and stop when it's enough,
(b) no whole file repeats across filings, and (c) any past filing can be re-downloaded later —
**without ever storing the user's source code**?

## Recommended Direction

A Next.js web app (Vercel + Neon Postgres) that reads the user's GitHub repos, shows each as a
file tree with an estimated page count per file, and lets the user **manually pick whole files
among the unused ones** (status shown by markers) while a **running page count accumulates**.
The user decides when there's enough — the app never asks for a target and never validates
against one. It then renders a paginated, print-ready PDF **on the client**, matching the look
of `generate.js`, which serves purely as the **visual reference** for the output (not a
prototype to port, not a source of requirements). Every exported file is recorded so
already-used files are locked out of future listings.

The defining constraint is **legal formality, not audit**: nobody diffs the code line by line.
How many pages a given payout requires is **the user's own knowledge**, kept out of the app —
that keeps the tool legally neutral and portable across countries and currencies. Uniqueness is
tracked at **file level** (`path` + `content_hash`), which also gives the `used-but-changed`
status for free (same path, new hash).

**We store zero source code.** For NDA safety, the DB holds only metadata + hashes: per used
file `{repo, path, commit_sha, content_hash}`, and per export `{actual_pages, date}`.
Reproduction of a past filing re-fetches each file **pinned at its commit SHA** from GitHub and
re-renders with the current generator; the originally recorded page count is shown alongside the
new one **for information only**, never as a validation gate. A DB breach therefore leaks names
and hashes — never code. Reproduction is treated as **convenience, not the source of truth**:
the authoritative copy is the PDF the user already emailed to their accountant. So if a
repo/commit is deleted, we don't fight it — we show a graceful `source-gone` state and point
the user to their emailed copy.

**Auth is GitHub-only, via a GitHub App (not a classic OAuth App).** No magic links, email, or
passwords. This is a security decision, not a preference: a classic OAuth App would require the
`repo` scope, which grants **read _and write_ to every private repository** the user has — a
disproportionate ask from strangers on a public instance, and catastrophic if a token leaks. A
GitHub App instead uses per-repository installation with `Contents: Read-only`, so a stolen
token can read only the repos the user chose and can write nothing. It also matches the intended
UX natively: the user picks which repos to expose and changes that later in GitHub's own
settings — something an OAuth App cannot honestly implement, since its token would still reach
everything.

**No long-lived GitHub token is stored.** Every GitHub call happens while the user is actively
in the app — there are no background jobs — so the token lives in Auth.js's default encrypted
JWT session cookie and never reaches Neon. A DB dump therefore yields no repo access at all. If
a refresh token is ever persisted for convenience, it must use **application-level** encryption
(AES-256-GCM, per-record nonce, key version stored alongside, key in env/KMS and never in the
DB) — the provider's at-rest disk encryption is irrelevant here, since it protects only against
physical disk theft, not against a dump taken with valid credentials.

An **anonymous mode** (no login) supports the "just drop files → get a PDF" flow, fully
client-side with nothing persisted (and therefore no uniqueness tracking — that requires an
account).

## Key Assumptions to Validate

- [ ] **Page estimate ≈ actual pagination.** Tree estimates come from blob `size` (fast, 1 API
      call); the real rendered page count is the source of truth and is what the running total
      must converge to. — _test: compare byte-size estimate vs actual rendered pages across a
      sample of real files._
- [ ] **File-level uniqueness is sufficient for the formality.** — _test: confirm with the
      accountant that whole-file, non-repeating submissions are what's expected._
- [ ] **Regeneration-as-convenience is acceptable long-term.** — _test: confirm the user is
      fine relying on their emailed copy when a repo/commit is gone._
- [ ] **Storing repo names + file paths is NDA-acceptable.** Hashes are irreversible; paths
      are mild metadata. — _test: sanity-check against the strictest NDA in scope._
- [ ] **Session-scoped tokens are sufficient — no long-lived credential is ever needed.** Rests
      on "every GitHub call is interactive". — _test: walk every flow (tree browse, file fetch,
      past-export regeneration) and confirm none needs to run without the user present._

## MVP Scope

**In:**

- **Sign-in via Auth.js pointed at a GitHub App.** Auth.js stays — it is neutral about
  permissions and by default requests only profile/email (`read:user`, `user:email`), never repo
  access. The GitHub App's user-to-server flow uses the same OAuth2 endpoints, so it is the same
  provider with the App's client ID/secret. With GitHub Apps the `scope` parameter is **ignored**
  — permissions come from the App's configured `Contents: Read-only` plus the repos the user
  selected at install, making "accidentally ask for too much" structurally impossible. Never
  request `scope: "repo"`.
- **Installation flow is custom work — budget for it.** Auth.js handles login but not
  installation. Detect "authenticated, but the App is installed on no repos", redirect to the
  install URL, and handle the return. Also implement refresh in the `jwt` callback, since
  user-to-server tokens expire in ~8h (governed by the App's "Expire user authorization tokens"
  setting — verify against current GitHub docs at implementation time).
- **Anonymous mode:** upload files → client-side PDF, nothing stored, no account.
- Build the file tree from the **Git Trees API in a single `recursive=1` call**; estimate pages
  per file from blob `size`. A running total accumulates as files are picked — **no target
  input, no threshold check, no payout arithmetic.**
- **The tree is not canonical data — it's fetched live and cached** (never stored as source of
  truth, never with file content). Explicit two-tier cache keyed by `{repo_id}@{head_sha}`,
  value = lightweight `{path, size, blob_sha, type}` array (NDA-safe):
  - **Client (React Query/SWR):** long `staleTime` → repeated in-session navigation to the
    project page hits GitHub **zero** times after the first load.
  - **Neon snapshot:** survives refresh / cold start → first paint served from DB, not GitHub.
  - **Invalidation:** one cheap branch-head-SHA check on load; matches cached key → serve cache
    (no Trees call); changed → refetch + update both tiers. Plus a manual "Refresh" button and a
    TTL backstop. `used` / `used-but-changed` are overlaid on the cached tree via stored hashes.
- Lazy-fetch file **content only for selected files**, small concurrency (3–5), token kept
  server-side (Next Route Handlers / serverless on Vercel).
- Client-side PDF matching `generate.js` (A4, Courier code, Helvetica-Bold titles).
- On export: persist `{repo, path, commit_sha, content_hash}` per file + export record
  `{actual_pages, date}`.
- Uniqueness: mark used files in the tree, detect `used-but-changed` via hash compare, warn
  before re-adding.
- **Folder-level operations in the tree** — never force file-by-file clicking. A folder node
  supports select-all / deselect-all, hide, and mark-as-vendored, with **tri-state checkboxes**
  (none / partial / all). Each folder shows its **aggregate page estimate** and how many of its
  files are still available vs already used — so the user can reach the volume he needs by
  adding a folder wholesale instead of hunting files. **Bulk-select respects the locks:**
  already-used and vendored files are skipped by default and reported as a count ("added 12
  files, skipped 5 used + 3 vendored"), so folder-add can never silently break the no-repeat
  guarantee.
- **Language-agnostic file support.** Accept any text/source file, configurable
  allowed-extension list, binaries excluded — not limited to JS/TS. Page estimation and PDF
  rendering are language-neutral by nature.
- Detect and flag **vendored / generated code that lives inside the repo** — the hard case is
  shadcn (committed as `.tsx` in your source tree, looks authored but is MIT-generated).
  Detection is layered and **language-agnostic by design**; the JS/shadcn rule is just one
  plugin, not the foundation. Most authoritative first:
  1. **Manual user override — always wins.** "Mark as vendored / unmark as authored", applied to
     a **single file or a whole folder**. Persisted as `{repo, path_or_glob, classification}`
     (path-based, survives content changes); a folder rule **cascades to all descendants,
     including files added later**, and the most specific rule wins (file beats folder). This is
     the safety net for any wrong heuristic **and** the universal fallback for ecosystems we
     have no detector for.
  2. **`.gitattributes`** → respect the repo's own `linguist-vendored` / `linguist-generated`.
     Git-level, therefore works in **any** language.
  3. **Ecosystem detector plugins** — shadcn: parse `components.json` → `aliases.ui`, flag
     everything beneath it. Add more per ecosystem over time.
  4. **Structural default list**, multi-ecosystem (Linguist-style): JS (`node_modules`, `dist`,
     `.next`, `coverage`), Python (`venv`, `.venv`, `site-packages`, `__pycache__`, generated
     migrations), Go (`vendor/`), Rust (`target/`), Java/Gradle (`target/`, `build/`,
     `.gradle`), PHP/Composer + Ruby (`vendor/`, `vendor/bundle`), plus lockfiles, `*.min.*`,
     `*.generated.*`.

  UX: collapsed toolbar section, **hidden by default** (show/hide toggle); adding one **warns**
  (weakens the authorship claim) but **never hard-blocks** — the user decides. Modified vendored
  files surface their `used-but-changed` status. Path/pattern list configurable per project.

- Re-download a past export: re-fetch pinned SHAs → render → show original vs current page count
  informationally; graceful `source-gone` status when repo/commit is unavailable.
- **GDPR:** export all user data + delete account/data, on the settings page. In scope because a
  **public instance will exist** (link in the repo description); others may review the code or
  self-host.
- Minimal landing + Terms of Service / Privacy pages.
- Per-project stats: how many files used, % of total pages/lines consumed.

**Out:**

- **Any notion of a target/threshold** — no target input, no `pages >= N` validation. The user
  counts what he needs himself and stops when the running total looks right.
- **Payout → pages formula.** Deliberately outside the app: it's tax matter, varies by country,
  currency and rate, and would make the tool legally opinionated.
- **Auto-selecting files** to fill a volume — the user picks manually among unused files.
- Magic-link / email / password auth — GitHub only.
- **Classic OAuth App / `scope: "repo"`** — rejected outright: it grants read **and write** to
  every private repository, which no PDF generator has any business holding.
- **Storing long-lived GitHub tokens in the DB** — unnecessary, since all access is interactive.
- Storing source code or generated PDFs in the DB — metadata + hashes only.
- Generator versioning / keeping old generators runnable — the original page count is recorded
  for information only, so an old export simply re-renders with the current generator.
- Fragment- or line-level dedup — file level only.
- Reproduction for anonymous uploads — the user keeps the file / emailed copy.
- Multi-tenant SaaS billing — open-source, self-hostable, each user uses their own GitHub token
  (own 5000 req/hr budget).

## Open Questions

- Vendored-file detection: which patterns/heuristics beyond the obvious ones?
- Very large repos / monorepos: Git Trees API truncates past ~100k entries / 7 MB — how to page
  or scope the tree?
- Anonymous mode boundary: session-only, truly nothing persisted (confirm no telemetry leaks).
- Regeneration UX when a subset of a past export's files are `source-gone` — partial PDF or hard
  fail?
