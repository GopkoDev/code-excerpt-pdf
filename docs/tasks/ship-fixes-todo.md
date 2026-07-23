# TODO — `/ship` follow-up fixes

Task list for `docs/tasks/ship-fixes-plan.md`. Work top to bottom; ordered by
dependency. Every task ends green on
`npm run test && npm run typecheck && npm run lint && npm run build`.

Separate from the project build plan (`docs/tasks/todo.md`) — nothing here blocks
a checkpoint there. Source of each item: the `/ship` review of `b99c5a4..HEAD`
(cr = code-reviewer, sec = security-auditor, te = test-engineer).

Legend: **[blocker]** ship-gate blocker · **[risk]** acknowledged risk, isolate

---

## Phase 1 — The accessibility blocker

- [x] **Task 1 [blocker]** — Added `ButtonLink` (next/link + `buttonVariants`),
      migrated all 9 anchor call sites off `Button render=`, reverted
      `components/ui/button.tsx` to the generated shadcn shape. Removes the
      `role="button"`-on-anchors regression (cr) and deletes the component-element
      edge case (te #6) by removing the mechanism. `grep render={<` now returns
      only `alert-dialog.tsx`.
- [x] **Task 2** — Rewrote `button.test.tsx` to cover only real-button behaviour;
      added `button-link.test.tsx` (role=link, not role=button; href;
      variant/size classes; className merge). Suite 387 green.

### ▸ Checkpoint A — the regression is gone

- [ ] A nav link exposes `role="link"` (test + browser spot-check)
- [ ] No Base UI `nativeButton` warning on any page
- [ ] `grep -rn "render={<" app components --include=*.tsx` (minus tests) returns only `alert-dialog.tsx`
- [ ] Full green; human review of the `ButtonLink` API before Phase 3

---

## Phase 2 — Doc & config truth-ups (independent, fast)

- [ ] **Task 3** — Correct the stale header in `lib/github/errors.ts:5-6` (a
      budget-remaining 403 is NOT a burst limit). (cr)
- [x] **Task 4** — Fixed the self-contradicting Testing note in
      `.claude/ARCHITECTURE.md` (include pattern IS `*.test.ts` + `*.test.tsx`) and
      dropped the obsolete `button.tsx` local-edit bullet. _(Folded into Task 1's
      commit — the doc-accuracy gate required reflecting the reverted `button.tsx`
      and the new `button-link` files in the same commit.)_
- [ ] **Task 5** — Add `@testing-library/dom` to `devDependencies` (sec, cr); fix the
      "340 → 387" count in `docs/notes/2026-07-23-…` (real total 386). (te)

### ▸ Checkpoint B — docs match code

- [ ] Every doc touched by the original batch agrees with its code
- [ ] `npm run test && npm run typecheck && npm run lint` green

---

## Phase 3 — Coverage on the error and concurrency paths

- [ ] **Task 6** — Test `measureSelected`'s catch → error banner (readFile rejects
      mid-measure) and `renderOnce`'s worker-failure path + `isRendering` reset.
      Write failing-first. (te #1, #2)
- [ ] **Task 7** — Test interleaved `measureSelected` calls against the stale
      `measured` closure; assert settled state is correct regardless of response
      order. (te #7)
- [ ] **Task 8** — `client.test.ts`: assert `githubFetch` returns the parsed body;
      `statusForError` 401/404; end-to-end 418 → unknown → 500. (te #3, #4)
- [ ] **Task 9** — Resolve `retryAfterSeconds` (errors.ts:85): wire through
      `GitHubError` (+ a `Retry-After` on the 429) or delete the field and its two
      assertions. (te #5) — see Open question.

### ▸ Checkpoint C — the hook's failure modes are pinned

- [ ] Both new error tests go red against a reverted recovery path
- [ ] The concurrency test exercises overlap, not a sequential path
- [ ] Full green

---

## Phase 4 — Dependency hygiene (acknowledged risk, isolated)

- [ ] **Task 10 [risk]** — Bump `next` to 16.2.11 in its OWN commit; resolves the
      three High `npm audit` findings (next SSRF/middleware, nested postcss, sharp).
      Read the changelog; verify in the browser. (sec)
- [ ] **Task 11 (backlog)** — Route `app/api/github/refresh/route.ts:106` error log
      through `safeMessage`/`TOKEN_PATTERN`; optionally cover the OAuth client-secret
      shape. Defense-in-depth, out of the original batch. (sec)

### ▸ Checkpoint D — complete

- [ ] `npm audit` clear of the three Highs the `next` bump resolves
- [ ] All acceptance criteria met; ready for review

---

## Open question (blocks Task 9 only)

- Should a GitHub 429 response carry a `Retry-After` header (wire
  `retryAfterSeconds` through), or is the field dead weight to delete? Human call —
  depends on whether any client should honor it.
