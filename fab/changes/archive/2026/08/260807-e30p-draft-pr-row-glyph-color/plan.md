# Plan: Draft PR State for the Row PR Glyph

**Change**: 260807-e30p-draft-pr-row-glyph-color
**Intake**: `intake.md`

## Requirements

### Frontend: Row PR Glyph Color

#### R1: A draft open PR renders the inert gray token

`prGlyphColor(win)` in `app/frontend/src/components/pr-status-model.ts` SHALL return the existing
`text-text-secondary` theme token when the window's PR is open AND `win.prIsDraft` is truthy AND the
PR is not fail-ish. The token MUST be the established one — no new hex, no new entry in
`themes.ts`, no change to `app/frontend/src/globals.css`.

- **GIVEN** a window with `prNumber`, `prState: "open"`, `prIsDraft: true`, and `prChecks: "pass"`
- **WHEN** `prGlyphColor(win)` is called
- **THEN** it returns `"text-text-secondary"`
- **AND** the row's `row-pr-glyph` span carries that class, because `window-row.tsx` already
  interpolates `${prGlyphColor(win)}` into the glyph's `className` (no JSX edit is required)

#### R2: Glyph color precedence is exactly fail → draft → open-green → merged-purple

The draft branch SHALL sit **below** the fail-ish branch and SHALL be gated on
`win.prState === "open"`. `isFailish` (surfaced through `prDotState(win) === "fail"`) MUST continue
to dominate every other signal, and the merged→purple / closed→no-glyph paths MUST remain
structurally unreachable from the draft branch rather than incidentally unaffected.

- **GIVEN** a window with `prState: "open"`, `prIsDraft: true`, and `prChecks: "fail"`
- **WHEN** `prGlyphColor(win)` is called
- **THEN** it returns `"text-red-400"` — fail wins over draft
- **AND GIVEN** the same window but with `prReview: "changes_requested"` and `prChecks: "pass"`
- **THEN** it still returns `"text-red-400"` — `isFailish` covers review, not just checks
- **AND GIVEN** a window with `prState: "merged"` and `prIsDraft: true` (unreachable in practice —
  GitHub un-drafts on merge)
- **THEN** it returns `"text-purple-400"` — the `prState === "open"` gate keeps the merged path intact
- **AND GIVEN** a window with `prState: "open"`, `prIsDraft: true`, and `prChecks: "pending"`
- **THEN** it returns `"text-text-secondary"` — draft displaces the open-green case whether or not
  checks are still running, because the open-green branch is the one draft sits above

#### R3: Every comment site that enumerates the mapping states the four-way mapping

The three comment sites that currently enumerate a three-way mapping SHALL be updated to the
four-way mapping, and the `prGlyphColor` doc comment SHALL additionally state *why* fail dominates
and *why* the draft branch is open-gated:

1. the doc comment immediately above `prGlyphColor` (`pr-status-model.ts`, currently lines 241–249)
2. the `describe("prGlyphColor — rest-glyph color mapping")` block header comment
   (`pr-status-model.test.ts`, currently lines 90–91)
3. the inline glyph comment in the row (`sidebar/window-row.tsx`, currently lines 512–513)

- **GIVEN** a reader who opens any one of those three sites
- **WHEN** they read the enumerated mapping
- **THEN** it names all four outcomes — red fail-ish, gray open-draft, green open, purple merged
- **AND** the `prGlyphColor` doc comment states the precedence rationale (fail dominates; draft is
  open-gated so merged/closed are untouched by construction)

#### R4: The draft mapping is covered by unit and row-render tests

New behavior SHALL ship with tests per `fab/project/code-quality.md`. Coverage SHALL comprise unit
cases inside the existing `describe("prGlyphColor — rest-glyph color mapping")` block of
`app/frontend/src/components/pr-status-model.test.ts` and one render assertion inside the existing
`describe("rest-state PR glyph (93dy)")` block of
`app/frontend/src/components/sidebar/window-row.test.tsx`. The frontend Vitest suite and
`tsc --noEmit` MUST both pass.

- **GIVEN** the new tests
- **WHEN** `just test-frontend` runs
- **THEN** the gray-draft case, the two fail-dominates-draft cases, the merged-draft open-gate case,
  and the pending-draft case all pass at the unit level
- **AND** a row rendered with `prNumber` + `prState: "open"` + `prIsDraft: true` exposes
  `data-testid="row-pr-glyph"` with a `className` containing `text-text-secondary`
- **AND** `cd app/frontend && npx tsc --noEmit` reports no errors

#### R5: The change stays inside the glyph-only scope boundary

Per the user's explicit instruction ("no i only want to plan for PR icon not dot"), this change MUST
NOT modify the status-dot surface or the backend. Specifically it MUST NOT touch
`status-dot.tsx`, `status-dot-label.ts`, `prDotState`, `prShape`, `PHASE_HUE`, `DotShape`,
`DotPhase`, `sidebar/registers.ts`, `sidebar/row-flyout-card.tsx`, `themes.ts`, `globals.css`, or
any Go file. The existing dot-level draft test at `window-row.test.tsx:357` ("renders a purple solid
for a draft with passing checks (green=health → solid)") MUST remain byte-identical — it asserts the
dot, it stays correct, and after this change it documents the deliberate dot-vs-glyph split. The
memory-doc update named in the intake is the hydrate stage's job and MUST NOT be performed here.

- **GIVEN** the completed diff for this change
- **WHEN** `git diff --name-only` is inspected
- **THEN** it lists only `pr-status-model.ts`, `pr-status-model.test.ts`,
  `sidebar/window-row.tsx`, `sidebar/window-row.test.tsx`, and this change's `fab/` artifacts
- **AND** `git diff app/frontend/src/components/sidebar/window-row.test.tsx` shows no change inside
  the `it("renders a purple solid for a draft with passing checks …")` body
- **AND** `docs/memory/` is untouched

### Non-Goals

- **The status dot** — hue stays family-owned (cool = fab pipeline, purple `pr`; warm = ad-hoc agent,
  orange `agentPr`) and PR status stays on the orthogonal `DotShape` axis. A draft hue there would
  break the family-identity glance rule; a draft *shape* would need new geometry in `status-dot.tsx`
  plus entries in three label maps.
- **`prDotState` / `prShape`** — "GREEN MEANS HEALTH, NOT MERGE-READINESS" is unchanged; a passing
  draft is still `healthy`.
- **`sidebar/registers.ts` and `sidebar/row-flyout-card.tsx`** — `getPrSegments` already appends
  `" (draft)"` to the state word; the text surfaces already carry draft.
- **A second (dashed) draft SVG** — color is the glyph's established status axis.
- **A new color token or hex** — `text-text-secondary` already exists.
- **The Go backend** — `prIsDraft` is already plumbed GraphQL → `PRStatus.IsDraft` → SSE →
  JSON `prIsDraft` → `WindowInfo.prIsDraft`.
- **`docs/memory/run-kit/ui-patterns.md`** — hydrate's job, not apply's.
- **The collector-join-miss draft fidelity gap** — see `## Notes`.
- **New e2e coverage** — `row-flyout.spec.ts` asserts glyph *presence* and hide-on-hover, not color,
  so no `.spec.ts` changes and (per the Test Companion Docs constitutional rule) no `.spec.md` update.

### Design Decisions

#### Gray via the existing `text-text-secondary` token

**Decision**: The draft branch returns the literal `"text-text-secondary"`.
**Why**: GitHub renders draft PRs gray, so the mapping is already in the user's head, and this token
is the established "inert / no journey" color in this exact model — it is `PHASE_HUE.none` and the
color the `skipped` shape forces in `status-dot.tsx`. Contrast in the light theme is ~4.8:1
(`#6b7280` on `#ffffff`), comfortably past the 3:1 WCAG floor for graphical objects, and the glyph is
`aria-hidden` decoration besides.
**Rejected**: A new muted token or a raw hex — it would contradict the immediately-preceding glyph
commit (#528, `f0dd111c`), whose own note is "No new color system, no new hex". Also rejected:
importing `PHASE_HUE.none` instead of the literal — that would couple the glyph's color axis to the
dot's phase map, which is precisely the coupling this change is designed not to create.
*Introduced by*: 260807-e30p-draft-pr-row-glyph-color

#### The draft branch is gated on `prState === "open"`

**Decision**: `if (win.prState === "open" && win.prIsDraft) return "text-text-secondary";`
**Why**: A merged or closed PR can never be draft in practice (GitHub un-drafts on merge). The gate
makes the merged→purple and closed→no-glyph paths untouched *by construction* rather than by luck,
and confines the draft branch to displacing exactly one case: open-green.
**Rejected**: An ungated `if (win.prIsDraft)` — behaviorally identical today, but it would leave the
merged path defended only by GitHub's server-side behavior instead of by local structure.
*Introduced by*: 260807-e30p-draft-pr-row-glyph-color

#### Fail stays above draft

**Decision**: The `prDotState(win) === "fail"` branch keeps first position.
**Why**: A draft whose checks are failing (or that has changes requested) is a problem first and a
draft second. This preserves the codebase-wide rule that `isFailish` dominates — the same rule
`prDotState` encodes by ordering `fail` ahead of `healthy`, and the rule the glyph already follows.
**Rejected**: Draft-first — it would hide a red signal behind a gray one on exactly the rows the user
still owes work to.
*Introduced by*: 260807-e30p-draft-pr-row-glyph-color

#### Color-only, one icon

**Decision**: One `GitPullRequestIcon`, varied only by color.
**Why**: Color is the glyph's established status axis here, and the Sidebar Row Icon System
(`260724-2bmy`) pins one icon system per surface. No JSX edit is needed at all — the row already
interpolates `prGlyphColor(win)`.
**Rejected**: GitHub's distinct dashed draft-PR glyph — a second SVG is more maintained surface for
one bit of information color already carries.
*Introduced by*: 260807-e30p-draft-pr-row-glyph-color

## Tasks

### Phase 2: Core Implementation

- [x] T001 Add the open-gated draft branch to `prGlyphColor` in `app/frontend/src/components/pr-status-model.ts`, immediately below the fail-ish branch and above the open/merged ternary, so the precedence reads fail → draft → open-green → merged-purple <!-- R1 -->
- [x] T002 Extend the doc comment above `prGlyphColor` (`app/frontend/src/components/pr-status-model.ts`, currently lines 241–249) to enumerate the four-way mapping and state the precedence rationale — fail dominates, draft is open-gated so merged/closed stay untouched by construction <!-- R2 -->

### Phase 3: Integration & Edge Cases

- [x] T003 [P] Add the draft unit cases to `describe("prGlyphColor — rest-glyph color mapping")` in `app/frontend/src/components/pr-status-model.test.ts` — open+draft+pass → `text-text-secondary`, open+draft+fail → `text-red-400`, open+draft+`changes_requested` → `text-red-400`, merged+draft → `text-purple-400`, open+draft+pending → `text-text-secondary` — and update the block's header comment to name the draft case <!-- R4 -->
- [x] T004 [P] Add one render assertion to `describe("rest-state PR glyph (93dy)")` in `app/frontend/src/components/sidebar/window-row.test.tsx`: a window with `prNumber` + `prState: "open"` + `prIsDraft: true` renders `row-pr-glyph` with a className containing `text-text-secondary` and not `text-accent-green` <!-- R4 -->

### Phase 4: Polish

- [x] T005 Update the inline glyph comment in `app/frontend/src/components/sidebar/window-row.tsx` (currently lines 512–513) to include the draft case — comment only, no JSX change <!-- R3 -->
- [x] T006 Run the gates — `just test-frontend` and `cd app/frontend && npx tsc --noEmit` — and confirm the scope boundary via `git diff --name-only` plus a diff check that the dot-level draft test at `window-row.test.tsx:357` and `docs/memory/` are untouched <!-- R5 -->

## Execution Order

- T001 blocks T003 and T004 (the tests assert the new branch)
- T002 depends on T001 only for coherence; T003/T004 are `[P]` with respect to each other
- T005 is independent of T001–T004 (comment-only) but is sequenced last with T006 as the closing gate
- T006 runs last — it is the verification sweep over everything above

## Acceptance

### Functional Completeness

- [x] A-001 R1: `prGlyphColor` returns `text-text-secondary` for an open, non-fail-ish PR with `prIsDraft: true`, using the existing theme token with no new hex, no `themes.ts` edit, and no `globals.css` edit.
- [x] A-002 R2: The function body's branch order is exactly fail-ish → open-and-draft → open-green → merged-purple, with the draft branch conjoined on `win.prState === "open"`.
- [x] A-003 R3: All three comment sites (the `prGlyphColor` doc comment, the test block header, the `window-row.tsx` inline comment) enumerate the four-way mapping, and the doc comment additionally states why fail dominates and why draft is open-gated.
- [x] A-004 R4: The new unit cases live inside the existing `prGlyphColor` describe block and the new render assertion inside the existing `rest-state PR glyph (93dy)` describe block — no new test file, no new describe block.

### Behavioral Correctness

- [x] A-005 R2: A failing draft renders red, not gray — both the `prChecks: "fail"` and the `prReview: "changes_requested"` routes.
- [x] A-006 R1: A non-draft open PR is unchanged (`prIsDraft` absent or `false` → `text-accent-green`), and a merged PR is unchanged (`text-purple-400`).
- [x] A-007 R1: The row glyph picks up the new token with **no** JSX change to `window-row.tsx` — the diff there is comment-only.

### Scenario Coverage

- [x] A-008 R4: `just test-frontend` passes with the new cases exercising gray-draft, fail-dominates-draft (checks), fail-dominates-draft (review), merged-draft, and pending-draft.
- [x] A-009 R4: `cd app/frontend && npx tsc --noEmit` reports no errors.

### Edge Cases & Error Handling

- [x] A-010 R2: `prState: "merged"` + `prIsDraft: true` still returns purple — the open-gate makes the merged path unreachable from the draft branch, pinned by a test even though GitHub un-drafts on merge.
- [x] A-011 R2: A closed PR still renders no glyph at all — the `prOwnsDot` gate is unmodified, so the draft branch is never consulted for it.
- [x] A-012 R2: A pending-checks draft renders gray, not green — draft sits above the open-green branch, and `prDotState` returning `pending` does not divert the glyph.

### Removal Verification

- [x] A-013 R5: Nothing is removed — `prDotState`, `prShape`, `PHASE_HUE`, `DotShape`, `DotPhase`, `status-dot.tsx`, `status-dot-label.ts`, `sidebar/registers.ts`, `sidebar/row-flyout-card.tsx`, and every Go file are byte-identical, and the dot-level draft test at `window-row.test.tsx:357` is unmodified.
- [x] A-014 R5: `docs/memory/` is untouched by this change — the `ui-patterns.md` update named in the intake is deferred to hydrate.

### Code Quality

- [x] A-015 Pattern consistency: The new branch matches the function's existing style — a single-line early-return guard returning a Tailwind token literal, consistent with the three literals already in `prGlyphColor` and with the guard style in `prDotState`.
- [x] A-016 No unnecessary duplication: The fail check is reused via `prDotState(win) === "fail"` (not a re-implemented `isFailish`), the draft signal is read from the already-plumbed `WindowInfo.prIsDraft`, and the color reuses the existing `text-text-secondary` token rather than introducing a parallel one.
- [x] A-017 Type narrowing over type assertions: No `as` cast is added — `win.prIsDraft` is an optional boolean and is read as a plain truthiness guard.
- [x] A-018 Tests for changed behavior: Per `code-quality.md` ("New features and bug fixes MUST include tests covering the added/changed behavior"), both the pure function and the row render carry new assertions.
- [x] A-019 No god functions: `prGlyphColor` stays at three statements — well inside the codebase's typical function size.
- [x] A-020 **N/A**: No polling / no shell strings / no DB — N/A by construction for a pure frontend color function; nothing in this change touches subprocesses, timers, or persistence.

## Notes

- Check items as you review: `- [x]`
- All acceptance items must pass before `/fab-continue` (hydrate)
- If an item is not applicable, mark checked and prefix with **N/A**: `- [x] A-NNN **N/A**: {reason}`
- **Follow-up candidate (captured, deliberately not fixed here)** — `prIsDraft` is
  collector-join-only. When the URL-keyed collector join misses (a PR aged out of the viewer's
  top-`$limit` GraphQL window), `app/backend/api/sse.go:1148` resets `PrIsDraft` to `false` while
  `prState` survives via the branch refresher's `MapBranchState` fallback, so such a draft renders as
  a normal green open PR. The degradation is graceful — it falls back to exactly today's behavior,
  never to something wrong — and the glyph is `aria-hidden` decoration. Fixing it means adding
  `isDraft` to the `--json` field list in `branchPRExec` and carrying it through the `BranchPR`
  struct (`app/backend/internal/prstatus/prstatus_branch.go`), which is backend work outside this
  change's glyph-only boundary.

## Deletion Candidates

None — this change adds new functionality without making existing code redundant.

- Considered and rejected: `sidebar/registers.ts:83`'s `" (draft)"` state-segment suffix is **not**
  redundant now that the glyph carries draft — the glyph is `aria-hidden` decoration, so the text
  segment remains the only accessible and only screen-reader-reachable draft signal.
- Considered and rejected: the dot-level draft test at `window-row.test.tsx:363` ("renders a purple
  solid for a draft with passing checks") is **not** obsolete — it pins the deliberate dot-vs-glyph
  split this change creates, so it gains value rather than losing it.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Scope is the row PR glyph only — status dot, `DotShape`, `prDotState`, `prShape`, `PHASE_HUE`, `registers.ts`, `row-flyout-card.tsx`, and the Go backend are untouched (R5) | Explicit and emphatic user instruction carried through the intake ("no i only want to plan for PR icon not dot"); a hard boundary, not an inference | S:95 R:90 A:95 D:95 |
| 2 | Certain | Precedence is fail → draft → open-green → merged-purple, with the draft branch conjoined on `prState === "open"` (R2) | Specified verbatim in the intake with the code block; mirrors the `isFailish`-dominates rule already encoded in `prDotState` and the current `prGlyphColor` | S:90 R:85 A:90 D:90 |
| 3 | Certain | The existing dot-level draft test (`window-row.test.tsx:357`) is left byte-identical | Intake instructs it explicitly; it asserts the dot (out of scope), stays correct, and now documents the deliberate dot-vs-glyph split | S:90 R:90 A:90 D:90 |
| 4 | Certain | The memory-doc update (`docs/memory/run-kit/ui-patterns.md`) is deferred to hydrate, not performed during apply | `/fab-continue` Apply Behavior owns source code only; `docs/memory/` is written by the hydrate block (Key Properties table) | S:85 R:95 A:95 D:95 |
| 5 | Certain | The new draft branch returns the string literal `"text-text-secondary"` rather than importing `PHASE_HUE.none` | The function's existing three returns are literals, so a literal is the pattern-consistent choice; importing the dot's phase map would couple the glyph's color axis to the dot model this change deliberately leaves alone | S:70 R:95 A:90 D:85 |
| 6 | Confident | Draft renders as `text-text-secondary` (existing gray token), not a new token or hex | GitHub renders drafts gray; the token is already the "inert" color in this model (`PHASE_HUE.none`, the `skipped` shape); preceding glyph commit #528 pins "No new color system, no new hex". User named no color — this was recommended in the plan they acted on | S:55 R:90 A:85 D:70 |
| 7 | Confident | One `GitPullRequestIcon` varied by color — no separate dashed draft SVG, and therefore no JSX change in `window-row.tsx` | Color is the glyph's established status axis, the Sidebar Row Icon System (`260724-2bmy`) pins one icon system per surface, and the row already interpolates `prGlyphColor(win)` into the className | S:50 R:85 A:75 D:60 |
| 8 | Confident | A fifth unit case (open + draft + `prChecks: "pending"` → gray) is added beyond the four the intake enumerates | It pins the one non-obvious consequence of placing draft above the open-green branch — a pending draft goes gray rather than green — inside the same describe block, with no new surface. Additive test coverage of the exact behavior under change, not scope creep | S:55 R:95 A:80 D:70 |
| 9 | Confident | Light-theme legibility is accepted from the existing precedent plus a contrast computation — no Playwright/visual check is run and no e2e test is added | Intake open question. `#6b7280` on `#ffffff` is ~4.8:1, well past the 3:1 WCAG 1.4.11 floor for graphical objects; the token already renders as the gray floor dot in this exact row; the glyph is `aria-hidden` decoration. `row-flyout.spec.ts` asserts glyph presence, not color, so no e2e is affected | S:50 R:90 A:80 D:70 |
| 10 | Confident | The collector-join-miss draft fidelity gap is recorded in `## Notes` as a follow-up candidate, not filed as a separate change and not fixed | Intake instructs "captured as a follow-up rather than silently absorbed"; the fix is backend work (`branchPRExec` `--json` fields + the `BranchPR` struct) outside the glyph-only boundary, and the degradation is graceful | S:60 R:80 A:75 D:65 |

10 assumptions (5 certain, 5 confident, 0 tentative).
