# Implementation Plan: `/ship` follow-up fixes

Follow-up work from the `/ship` release-gate review of the batch `b99c5a4..HEAD`
(the `useFileSelection` test suite + the three GitHub/Button fixes + the Prettier
sweep). The GitHub-403 work and the new tests are sound and already merged; this
plan cleans up the one real regression that review surfaced and the smaller
truth-ups and coverage gaps around it.

This is a **separate** plan from `docs/tasks/plan.md` (the project build plan) —
none of it blocks a checkpoint there. Its own Definition of Done is the standing
one: every task ends green on `npm run test && npm run typecheck && npm run lint
&& npm run build`.

## Overview

One blocker, a handful of doc/config truth-ups, and a set of test-coverage
additions on the exact hook where two production bugs already lived. The blocker
is an accessibility regression: `components/ui/button.tsx` now sets
`nativeButton={false}` whenever it renders a non-`<button>` element, which makes
Base UI stamp `role="button"` onto every navigation anchor in the app — a WCAG
4.1.2 role mismatch on controls that navigate to a URL.

## Architecture decisions

- **Remove the `nativeButton` derivation rather than refine it.** Every
  production `Button` that passes an anchor to `render` is pure navigation (7
  `<Link>`, 2 raw `<a>`; see `grep` in the ship report). None is a form control.
  So the right move is not to guess `nativeButton` more cleverly — it is to stop
  routing navigation through Base UI's button semantics at all. Navigation gets a
  link that is _styled_ as a button (`buttonVariants`), keeping its implicit
  `role=link`. This also deletes the component-element edge case (a
  `render={<Component/>}` that ultimately renders a `<button>` would be
  misclassified by `render.type !== "button"`) — the mechanism that creates it is
  gone, so there is nothing left to document or guard.
- **A dedicated `ButtonLink` for internal routes; inline `buttonVariants` for the
  two raw anchors.** `ButtonLink` wraps `next/link` and carries the same
  `variant`/`size` API as `Button`, so call sites read the same. The download
  (`<a download>`) and external (`<a target="_blank">`) anchors are one-offs that
  are not routes, so they take `className={cn(buttonVariants({ variant, size }),
className)}` directly rather than being forced through `ButtonLink`.
- **`Button` reverts to the generated shadcn component.** Once no call site passes
  an anchor, the `render`/`nativeButton` plumbing and the local docblock come out,
  and `components/ui/button.tsx` is back to the upstream shape. The
  `.claude/ARCHITECTURE.md` "local edit" note for it is removed in the same commit.
- **Keep the changes in small, independently-green commits**, ordered blocker →
  truth-ups → coverage → dependency bump, so each can be reverted cleanly and the
  dependency bump stays isolated per the review discipline.

## Task list

### Phase 1 — The accessibility blocker

- [ ] **Task 1** — Add `ButtonLink`, migrate the nav anchors, revert `Button`
- [ ] **Task 2** — Re-point `button.test.tsx` at link semantics; add a `ButtonLink` test

### Checkpoint A — the regression is gone

- [ ] A signed-in nav link exposes `role="link"`, not `role="button"` (asserted in a test and spot-checked in the browser)
- [ ] No Base UI `nativeButton` console warning fires on any page
- [ ] `npm run test && npm run typecheck && npm run lint && npm run build` all green
- [ ] Human review of the `ButtonLink` API before the coverage phase builds on it

### Phase 2 — Doc & config truth-ups (independent, fast)

- [ ] **Task 3** — Correct the stale module docstring in `lib/github/errors.ts`
- [ ] **Task 4** — Fix the self-contradicting Testing note in `.claude/ARCHITECTURE.md`
- [ ] **Task 5** — Declare `@testing-library/dom` explicitly; fix the work-log test count

### Checkpoint B — docs match code

- [ ] Every doc touched in the original batch now agrees with the code it describes
- [ ] `npm run test && npm run typecheck && npm run lint` green (no build change needed)

### Phase 3 — Coverage on the error and concurrency paths

- [ ] **Task 6** — Cover `measureSelected`'s failure banner and `renderOnce`'s worker-failure path
- [ ] **Task 7** — Cover interleaved `measureSelected` calls against the stale `measured` closure
- [ ] **Task 8** — Close the small `client.ts` / `statusForError` path gaps
- [ ] **Task 9** — Resolve `retryAfterSeconds`: wire it through or delete it

### Checkpoint C — the hook's failure modes are pinned

- [ ] Both untested error surfaces on `useFileSelection` now have a failing-first, then-passing test
- [ ] The concurrency test fails against a deliberately reintroduced stale-closure bug
- [ ] Full suite green

### Phase 4 — Dependency hygiene (acknowledged risk, isolated)

- [ ] **Task 10** — Bump `next` to 16.2.11 in its own commit
- [ ] **Task 11** _(backlog)_ — Route the refresh route's error log through `safeMessage`

### Checkpoint D — complete

- [ ] `npm audit` no longer reports the three High findings that the `next` bump resolves
- [ ] All acceptance criteria met; ready for review

---

## Tasks

### Task 1 — Add `ButtonLink`, migrate the nav anchors, revert `Button`

**Description:** Introduce `ButtonLink` (a `next/link` styled with `buttonVariants`)
and move every navigation call site off `Button`'s `render` prop onto it, so the
anchors keep `role=link`. Apply `buttonVariants` inline to the two raw `<a>`
anchors (download, external). Then revert `components/ui/button.tsx` to the
generated shadcn shape (drop the `isValidElement`/`nativeButton` logic and the
docblock), since no call site needs it anymore.

**Acceptance criteria:**

- [ ] A `ButtonLink` component exists with the same `variant`/`size` API as `Button`, rendering a `next/link` with `buttonVariants` classes and forwarding `href`/`className`/children.
- [ ] All 7 `render={<Link/>}` sites (`app/(app)/layout.tsx:41,45,55,64`, `app/(marketing)/layout.tsx:37`, `app/(marketing)/page.tsx:66,158`, `components/projects/repo-workspace.tsx:214`) use `ButtonLink`; the 2 raw-anchor sites (`app/(app)/settings/page.tsx:135` download, `components/pdf/pdf-preview.tsx:51` external) use a styled `<a>`.
- [ ] `components/ui/button.tsx` no longer imports `isValidElement` or references `nativeButton`/`render`; it matches the upstream generated component.
- [ ] `alert-dialog.tsx:168` (a `Button` rendered _into_ `AlertDialogPrimitive.Close`) is untouched and still works.

**Verification:**

- [ ] `npm run test && npm run typecheck && npm run lint && npm run build` green
- [ ] Manual (real browser, both shells): every nav link announces as a link; visual styling unchanged; no `nativeButton` warning in the console

**Dependencies:** None
**Files likely touched:** `components/ui/button-link.tsx` (new), `components/ui/button.tsx`, `app/(app)/layout.tsx`, `app/(app)/settings/page.tsx`, `app/(marketing)/layout.tsx`, `app/(marketing)/page.tsx`, `components/projects/repo-workspace.tsx`, `components/pdf/pdf-preview.tsx`
**Estimated scope:** L (mechanical migration across 8 files + 1 new + 1 revert)

### Task 2 — Re-point `button.test.tsx` at link semantics; add a `ButtonLink` test

**Description:** The current `button.test.tsx` pins the regression ("an anchor
styled as a button still announces itself as one"). Rewrite those cases so they
assert the _correct_ outcome — a navigation anchor is queryable as a link, not a
button — and add a small `ButtonLink` test covering variant/size class application
and `href` forwarding.

**Acceptance criteria:**

- [ ] The test that asserted a `render={<a>}` element is `getByRole("button")` is replaced by one asserting it is `getByRole("link")` (or explicitly _not_ `role="button"`).
- [ ] `Button` with no `render` still renders a native `<button>` and fires no warning — that case stays.
- [ ] A `ButtonLink` test asserts it renders an `<a>` with the right `href` and carries `buttonVariants` classes for a given `variant`/`size`.

**Verification:**

- [ ] `npm run test` green; the rewritten link assertion fails if Task 1 is reverted
      **Dependencies:** Task 1
      **Files likely touched:** `components/ui/button.test.tsx`, `components/ui/button-link.test.tsx` (new)
      **Estimated scope:** S

### Task 3 — Correct the stale module docstring in `lib/github/errors.ts`

**Description:** The file header (`errors.ts:5-6`) still states "A 403 with budget
remaining is a burst limit, fixed by slowing down" — exactly the misconception the
batch removed. The inline block at `:70-81` is correct; bring the header into line
(budget-remaining alone is not throttling; only `remaining:0`, `retry-after`, or an
explicit 429 is).

**Acceptance criteria:**

- [ ] The header no longer describes a budget-remaining 403 as a burst limit.
- [ ] It names the three real throttling signals, consistent with `describeResponse` and the inline comment.

**Verification:** [ ] `npm run test` green (behavior unchanged); doc reads true against `errors.ts:57-89`
**Dependencies:** None · **Files:** `lib/github/errors.ts` · **Scope:** XS

### Task 4 — Fix the self-contradicting Testing note in `.claude/ARCHITECTURE.md`

**Description:** The Testing prose says "everything stays `*.test.ts` and the
include pattern is unchanged," but the same batch added `**/*.test.tsx` to
`vitest.config.ts` and a JSX test (`button.test.tsx`). Correct the note to say the
pattern was extended to `*.test.tsx` and component tests run JSX under jsdom. Also
add `components/ui/button.test.tsx` to the file tree, and (folded in from Task 1)
remove the now-obsolete `button.tsx` "local edit" bullet.

**Acceptance criteria:**

- [ ] The Testing note states the include pattern covers `*.test.ts` + `*.test.tsx`, with component tests under jsdom.
- [ ] The file tree lists `components/ui/button.test.tsx`.
- [ ] The `button.tsx` local-edit bullet is gone (Task 1 reverted the edit).

**Verification:** [ ] Doc matches `vitest.config.ts` and the actual tree; CLAUDE.md's doc-accuracy gate satisfied
**Dependencies:** Task 1 (for the local-edit removal) · **Files:** `.claude/ARCHITECTURE.md` · **Scope:** XS

### Task 5 — Declare `@testing-library/dom`; fix the work-log test count

**Description:** RTL 16 lists `@testing-library/dom` as a peer dependency; it is
satisfied only transitively today. Add it explicitly to `devDependencies` so a
future dedupe cannot break the suite silently. Separately, `docs/notes/2026-07-23-…`
says "was 340, now 387" — the real total is 386; correct the count.

**Acceptance criteria:**

- [ ] `@testing-library/dom` appears in `package.json` `devDependencies` at the resolved version, with `package-lock.json` updated.
- [ ] The work-log count reads 386 (or is re-derived).

**Verification:** [ ] `npm ci` (or `npm install`) resolves cleanly; `npm run test` still 386 green
**Dependencies:** None · **Files:** `package.json`, `package-lock.json`, `docs/notes/2026-07-23-tests-and-three-fixes.md` · **Scope:** XS

### Task 6 — Cover `measureSelected`'s failure banner and `renderOnce`'s worker-failure path

**Description:** Two error surfaces on `useFileSelection` are untested — the exact
hook where both reported production bugs lived. `measureSelected`'s catch
(`use-file-selection.ts:343-345`) fires when `source.readFile` rejects mid-measure
or the worker returns a non-`"measured"` response, and should set the error banner.
`renderOnce`'s failure path (`:551-552`) throws on a non-`"rendered"` response and
must still reset `isRendering` in `finally`. Add tests for both, written failing-first.

**Acceptance criteria:**

- [ ] A test where the fake source's `readFile` rejects during measure asserts `error` is set and `isMeasuring` returns to false.
- [ ] A test where the worker returns a non-`"rendered"` response asserts `renderOnce` rejects and `isRendering` returns to false.
- [ ] Each test is confirmed to fail if its recovery path is removed.

**Verification:** [ ] `npm run test` green; both new tests red against a reverted recovery path
**Dependencies:** None (independent of Phase 1) · **Files:** `hooks/use-file-selection.test.ts` · **Scope:** S

### Task 7 — Cover interleaved `measureSelected` against the stale `measured` closure

**Description:** `measureSelected` closes over `measured` (`use-file-selection.ts:349`);
two selections fired before the first settles both read a stale map and can merge
out of order. Every current test awaits between clicks. Add an interleaved-clicks
test asserting the final `measured`/`totalPages` are correct regardless of response
ordering — the single most valuable addition for the shared pipeline.

**Acceptance criteria:**

- [ ] A test fires two selections without awaiting the first, with worker responses resolving out of order, and asserts the settled state matches paginating the full selection.
- [ ] The test is stable (no reliance on wall-clock timing beyond controllable promise ordering).

**Verification:** [ ] `npm run test` green; test exercises the overlap rather than a sequential path
**Dependencies:** None · **Files:** `hooks/use-file-selection.test.ts` · **Scope:** S

### Task 8 — Close the small `client.ts` / `statusForError` path gaps

**Description:** `githubFetch`'s success return (parsed JSON body) is never
asserted; `statusForError`'s 401 and 404 branches and an end-to-end unknown→500 are
untested. Add the missing assertions.

**Acceptance criteria:**

- [ ] A happy-path test asserts `githubFetch` resolves with the parsed JSON body.
- [ ] `statusForError` returns 401 for `unauthorized` and 404 for `not-found`.
- [ ] A 418 through `githubFetch` yields `GitHubError("unknown")` → status 500 end-to-end.

**Verification:** [ ] `npm run test` green
**Dependencies:** None · **Files:** `lib/github/client.test.ts` · **Scope:** S

### Task 9 — Resolve `retryAfterSeconds`: wire it through or delete it

**Description:** `ResponseProblem.retryAfterSeconds` is computed
(`errors.ts:85`) and asserted (`errors.test.ts:27,68`) but nothing consumes it —
`githubFetch` passes only `retryAt` into `GitHubError`. Decide: thread it through
`GitHubError` (and, if wanted, surface a `Retry-After` on the 429 response) so the
"wait N seconds" value is observable, or drop the field and its assertions. Prefer
wiring it through if the 429 response should carry `Retry-After`; otherwise delete.

**Acceptance criteria:**

- [ ] Either `GitHubError` carries `retryAfterSeconds` and a route reads it, **or** the field and its two test assertions are removed.
- [ ] No test asserts a value that nothing consumes.

**Verification:** [ ] `npm run test && npm run typecheck` green
**Dependencies:** None · **Files:** `lib/github/errors.ts`, `lib/github/client.ts` (+ a route if wired), `lib/github/errors.test.ts` · **Scope:** S · **See Open questions.**

### Task 10 — Bump `next` to 16.2.11 in its own commit

**Description:** `npm audit` reports three High findings (`next` SSRF/middleware
classes, nested `postcss`, `sharp`/libvips), all resolved by `next@16.2.11`
(`isSemVerMajor: false`). Upgrade in an isolated commit, review the changelog, and
let the green suite decide.

**Acceptance criteria:**

- [ ] `next` is at 16.2.11; `package-lock.json` diff reviewed (transitive `postcss`/`sharp` pulled up).
- [ ] The three High `npm audit` findings are gone.
- [ ] Its own commit, no other change riding along.

**Verification:** [ ] `npm run build && npm run test && npm run lint` green; `npm audit` clear of the three Highs; app still runs in the browser
**Dependencies:** None (isolate; do not fold into other tasks) · **Files:** `package.json`, `package-lock.json` · **Scope:** S (but treat as risk-bearing — verify in the browser)

### Task 11 _(backlog)_ — Route the refresh route's error log through `safeMessage`

**Description:** `app/api/github/refresh/route.ts:106` logs the raw `error.message`
rather than the redacted `safeMessage` the other routes use. No concrete leak path
exists (this route handles the OAuth secret and rotated tokens, so it is the one to
harden as defense-in-depth). Route the log through `safeMessage`/`TOKEN_PATTERN`;
optionally extend `TOKEN_PATTERN` to the OAuth client-secret shape. Out of this
batch's scope — tracked here so it is not lost.

**Acceptance criteria:**

- [ ] The refresh route's error log passes through the same redaction as the other GitHub routes.

**Verification:** [ ] `npm run test` green; a token-shaped string in a thrown message does not reach the log
**Dependencies:** None · **Files:** `app/api/github/refresh/route.ts`, possibly `lib/github/errors.ts` · **Scope:** S

---

## Risks and mitigations

| Risk                                                      | Impact | Mitigation                                                                                      |
| --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `ButtonLink` visual drift from `Button`                   | Med    | Share `buttonVariants`; spot-check both shells in the browser at Checkpoint A                   |
| A `Button render={<Link/>}` site missed in migration      | Med    | `grep` for `render={<` after Task 1 must return only `alert-dialog.tsx`; assert in Checkpoint A |
| `next@16.2.11` behavioral change despite non-major semver | Med    | Isolated commit, changelog read, browser verification, clean revert if red                      |
| Concurrency test flaky                                    | Low    | Drive promise ordering explicitly via the worker mock, not timers                               |

## Open questions

- **Task 9 direction.** Should a GitHub 429 response actually carry a `Retry-After`
  header (wire `retryAfterSeconds` through), or is the field dead weight to delete?
  Depends on whether any client is meant to honor it. Human call.
- **`ButtonLink` vs polymorphic `Button`.** This plan adds a separate `ButtonLink`
  rather than a polymorphic `Button` that switches element by prop. If the
  preference is one component, say so before Task 1 — it changes the call-site
  shape but not the a11y outcome.
