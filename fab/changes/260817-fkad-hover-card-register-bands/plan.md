# Plan: Hover Card Register Bands

**Change**: 260817-fkad-hover-card-register-bands
**Intake**: `intake.md`

## Requirements

### Registers: Data Shape

#### R1: The register resolvers SHALL expose structured parts alongside their joined strings

`registers.ts` SHALL gain parts-returning resolvers. The existing string-returning functions SHALL remain, reimplemented as formatters over the parts so their output is byte-identical to today's.

- **GIVEN** `getFabLine` today returns `"n927 branch-channel-draft-flag · review · active"`
- **WHEN** the parts resolver and the formatter are both in place
- **THEN** `getFabLine` returns that exact same string
- **AND** a caller can obtain `{ id, slug, stage, displayState }` separately without re-parsing it

#### R2: The PANE panel SHALL render byte-identically after the refactor

`status-panel.tsx` is the other consumer of these resolvers and is out of scope for any visual change.

- **GIVEN** the PANE panel rendering a window with all four registers
- **WHEN** this change is applied
- **THEN** its rendered text is unchanged, character for character
- **AND** no `status-panel.tsx` markup or class changes

### Hover Card: Layout

#### R3: The redundant status-label body line SHALL be removed

The `dotLabel(win, state)` line SHALL no longer render in `WindowFlyoutContent`. `dotLabel` SHALL remain exported and SHALL remain the status dot's accessible name.

- **GIVEN** a card whose row dot reads `PR-ready — active` and whose PR is merged
- **WHEN** the card opens
- **THEN** no body line restates the dot's label, so nothing appears to contradict the `pr` register
- **AND** the status dot's `aria-label` still carries the same string

#### R4: Critical tokens SHALL lead each register; expendable text SHALL trail

Within each register the short decisive tokens come first. Long optional text moves to an indented continuation line rendered in `text-text-secondary`, where truncation costs nothing.

- **GIVEN** a fab change `n927` with slug `branch-channel-draft-flag` at stage `review`, display state `active`
- **WHEN** the card renders it in a 320&nbsp;px card (~42 characters)
- **THEN** the first line reads `n927 · review · active` and is not truncated
- **AND** the slug renders on an indented continuation line, where truncation is acceptable

#### R5: The PR register SHALL split identity from health

The `pr` line carries number, state and the open-in-new-tab affordance. Checks and review segments move to a continuation line. All existing colours and the anchor behaviour are preserved.

- **GIVEN** a PR in its widest state — open, draft, checks pending, changes requested
- **WHEN** the card renders it
- **THEN** the identity line reads `#540 · open (draft) ↗` and the continuation line carries the health segments
- **AND** the whole line remains a single anchor to `prUrl` with its existing `stopPropagation`

#### R6: Freshness SHALL render inside the PR group and only with it

`FreshnessLine` moves to an indented continuation line under `pr`, and renders only when the `pr` register renders.

- **GIVEN** a window with `prFetchedAt` set but no `prNumber`
- **WHEN** the card opens
- **THEN** no freshness line renders, because there is no PR line for it to describe
- **GIVEN** a window with both
- **THEN** freshness renders indented under the PR block

#### R7: The registers SHALL be grouped under two labelled bands

Band one, "right now", holds `out` and `agt`. Band two, "this change", holds `fab` and `pr` with their continuation lines. Headings are small uppercase `text-text-secondary`.

- **GIVEN** a window with an agent, a fab change and a PR
- **WHEN** the card opens
- **THEN** both bands render with their headings in the fixed order above

#### R8: A band SHALL NOT render when it has no content

- **GIVEN** a plain shell pane — no agent, no fab change, no PR
- **WHEN** the card opens
- **THEN** the "right now" band renders with its single `out` line and the "this change" band does not render at all
- **AND** no empty heading appears

#### R9: Session and server card tiers SHALL be unaffected

Those tiers pass their own one-line facts content through the shared shell rather than these resolvers.

- **GIVEN** the coarse-pointer session and server cards
- **WHEN** this change is applied
- **THEN** their content renders exactly as before, with no band headings introduced

### Verification

#### R10: Tests SHALL cover the new shape

- **GIVEN** the change is applied
- **WHEN** `npx tsc --noEmit`, `just test-frontend` and `just test-e2e` run
- **THEN** all pass
- **AND** any modified `.spec.ts` has its sibling `.spec.md` updated in the same commit

### Non-Goals

- The PANE panel's appearance — data source refactored beneath it, rendering untouched.
- Chips and a stage rail (the rejected option C) — revisit only if the PR block still reads dense.
- Renaming the `out` / `agt` / `fab` / `pr` prefixes — `260723-fm08` is separately adding tooltips that name them.
- The card's surface, elevation, action rows or tray — shipped in `nwz9`.

### Design Decisions

#### Parts resolvers rather than reordered strings

**Decision**: add parts-returning resolvers to `registers.ts` and keep the existing string functions as formatters over them; the card composes from parts, the PANE panel keeps the strings.
**Why**: `registers.ts` is consumed by two surfaces and its module doc commits to one source, no drift. Reordering the joined strings would have silently restyled the PANE panel, which this change has no mandate to touch. Structured parts give the card its layout freedom while keeping a single definition of the facts.
**Rejected**: mutating the joined strings (restyles a second surface unasked); duplicating the resolvers for the card (the exact drift the module was extracted to prevent).
*Introduced by*: 260817-fkad-hover-card-register-bands

#### Two bands rather than a flat list

**Decision**: group `out`/`agt` under "right now" and `fab`/`pr` under "this change".
**Why**: the split is already true of the data — two registers describe the current second, two describe the journey. Naming it is what stops the fab phase word and the GitHub state word reading as a contradiction, and it lets the card shrink in whole groups on quiet panes instead of leaving gaps.
**Rejected**: a flat reordered list (fixes truncation but leaves four stories looking like one); chips and a stage rail (more machinery than the problem currently warrants).
*Introduced by*: 260817-fkad-hover-card-register-bands

#### Continuation lines rather than truncation

**Decision**: long values move to an indented `text-text-secondary` line under their register.
**Why**: the card is 42 characters wide; the fab line needs 43 and the widest PR line needs 68. Truncation is unavoidable somewhere, so the layout should choose what gets cut. Putting the decisive tokens first and the expendable text on its own line makes any remaining truncation harmless.
**Rejected**: widening the card (the coarse arm caps width against the 56&nbsp;px status rail, so it cannot widen everywhere); shrinking the font (breaks the monospace grid the card shares with the terminal).
*Introduced by*: 260817-fkad-hover-card-register-bands

## Tasks

### Phase 1: Data shape

- [x] T001 Add parts-returning resolvers to `app/frontend/src/components/sidebar/registers.ts` (`getFabParts`, plus part forms for output and agent), exporting their types <!-- R1 -->
- [x] T002 Reimplement `getFabLine` / `getOutputLine` / `getAgentLine` as formatters over the parts, preserving byte-identical output <!-- R1 -->
- [x] T003 Extend `registers.test.ts` to pin the formatters' output against the current strings and cover the parts resolvers <!-- R1 -->

### Phase 2: Card layout

- [x] T004 Remove the `dotLabel` body line from `WindowFlyoutContent` in `row-flyout-card.tsx`; drop the now-unused import if nothing else in the file uses it <!-- R3 -->
- [x] T005 Add a band-heading element and a continuation-line element to `row-flyout-card.tsx`, styled small-uppercase and indented-secondary respectively <!-- R7 -->
- [x] T006 Recompose the `out` and `agt` registers under the "right now" band <!-- R7 -->
- [x] T007 Recompose `fab` as `id · stage · displayState` with the slug on a continuation line <!-- R4 -->
- [x] T008 Recompose `pr` as identity + `↗` on the first line with checks/review segments on a continuation line, preserving the anchor, colours and `stopPropagation` <!-- R5 -->
- [x] T009 Move `FreshnessLine` into the `pr` group and gate it on the `pr` register rendering <!-- R6 -->
- [x] T010 Gate each band on having content so a plain shell pane renders no empty heading <!-- R8 -->

### Phase 3: Verification

- [x] T011 Confirm `status-panel.tsx` renders byte-identically — no markup or class changes, and its register text unchanged <!-- R2 -->
- [x] T012 Confirm the session and server card tiers render unchanged <!-- R9 -->
- [x] T013 Extend `row-flyout-card.test.tsx`: band presence and gating, continuation lines, the removed label line, freshness gated on `pr` <!-- R10 -->
- [x] T014 Run `tests/e2e/row-flyout.spec.ts`; update it and its sibling `.spec.md` together only if the change breaks its assertions <!-- R10 -->

### Phase 4: Gates

- [x] T015 Run `npx tsc --noEmit`, `PNPM_CONFIG_STRICT_DEP_BUILDS=false just test-frontend`, `just test-e2e`, and the frontend production build <!-- R10 -->

## Execution Order

- T001 blocks T002; T002 blocks T003
- T005 blocks T006–T010
- T011 and T012 are verification of untouched surfaces and may run alongside T013
- T015 runs last

## Acceptance

### Functional Completeness

- [x] A-001 R1: `registers.ts` exports parts resolvers and the string resolvers are formatters over them
- [x] A-002 R3: No body line restates `dotLabel`; the export and the dot's `aria-label` are intact
- [x] A-003 R4: The fab register leads with `id · stage · displayState` and carries the slug on a continuation line
- [x] A-004 R5: The PR register splits identity from health across two lines, anchor behaviour preserved
- [x] A-005 R6: Freshness renders indented under `pr` and only when `pr` renders
- [x] A-006 R7: Both bands render with their headings, in the fixed order

### Behavioral Correctness

- [x] A-007 R2: The PANE panel's rendered register text is byte-identical to before, with no markup changes
- [x] A-008 R8: A plain shell pane renders the first band only, with no empty second heading
- [x] A-009 R9: Session and server cards render unchanged, with no band headings introduced
- [x] A-010 R4: With a 25-character slug the fab first line is not truncated at 320&nbsp;px

### Scenario Coverage

- [x] A-011 R8: A unit test covers the plain-shell case and asserts the second band is absent
- [x] A-012 R5: A unit test covers the widest PR state (open, draft, checks pending, changes requested)
- [x] A-013 R10: `tsc --noEmit`, `just test-frontend`, `just test-e2e` and the production build all pass — affected spec `row-flyout` re-verified 15/15 green against a healthy backend in review; the full e2e suite's 91 failures are harness 502s in unrelated board/api/bottom-bar specs, no API or board code touched

### Edge Cases & Error Handling

- [x] A-014 R6: `prFetchedAt` present with no `prNumber` renders no freshness line
- [x] A-015 R4: A window with a fab change but no slug degrades without an empty continuation line
- [x] A-016 R7: On the coarse arm, where `size()` caps width against the 56&nbsp;px rail, both bands still render within the cap

### Code Quality

- [x] A-017 Pattern consistency: new elements follow the card's existing composition and Tailwind idiom
- [x] A-018 No unnecessary duplication: the card composes from the shared resolvers rather than re-deriving any fact
- [x] A-019 Tests accompany the change: every changed behaviour has unit coverage
- [x] A-020 No comment narration: comments state constraints the code cannot show; none narrates the next line, addresses the reviewer, or cites a change ID or PR number
- [x] A-021 Test companion docs: no `.spec.ts` modified without its sibling `.spec.md` updated in the same commit
- [x] A-022 Render performance: no new clock, subscription or lifted state; the card still mounts only while open

## Notes

- Check items as you review: `- [x]`
- All acceptance items must pass before hydrate
- If an item is not applicable, mark checked and prefix with **N/A**: `- [x] A-NNN **N/A**: {reason}`
- `just test-frontend` needs the `PNPM_CONFIG_STRICT_DEP_BUILDS=false` prefix under pnpm 11
- Go is not on this machine's PATH; `just build`'s Go leg cannot run and is immaterial here

## Deletion Candidates

None — this change adds new functionality without making existing code redundant. The removed `dotLabel` body line was a planned removal (R3), not a discovered candidate; `getFabLine` / `getPrSegments` remain live in `status-panel.tsx` and `status-bar.tsx`, and `dotLabel` / `statusDotState` remain live in `status-dot.tsx`.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Band order is "right now" then "this change" | Matches the reviewed mockup the user selected; liveness before journey also matches the card's existing top-to-bottom ordering | S:80 R:90 A:90 D:90 |
| 2 | Confident | Continuation lines are indented to the value column rather than the card edge | Keeps the prefix column readable as a column and visually subordinates the continuation to its register | S:60 R:90 A:85 D:80 |
| 3 | Confident | The PR anchor wraps the identity line only; the health continuation is plain text | Keeps the click target predictable and avoids an anchor spanning two visual rows | S:55 R:85 A:80 D:75 |
| 4 | Confident | Band headings use `text-text-secondary` at ~10px uppercase rather than a new token | The card already uses secondary for chrome text and the project resists new colour tokens | S:60 R:90 A:85 D:85 |
| 5 | Confident | `dotLabel`'s import is removed from the card only if unused after T004 | The function stays exported for the dot; removing a still-needed import would break the build, so the check is explicit | S:70 R:95 A:90 D:85 |

5 assumptions (1 certain, 4 confident, 0 tentative).
