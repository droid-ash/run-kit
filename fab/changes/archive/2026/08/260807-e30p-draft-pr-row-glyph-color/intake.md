# Intake: Draft PR State for the Row PR Glyph

**Change**: 260807-e30p-draft-pr-row-glyph-color
**Created**: 2026-08-07

## Origin

Conversational. The user first asked what GitHub colors the sessions list shows for open and merged PRs, then asked whether a draft-PR state could be introduced, then narrowed scope hard:

> can you introduce another state for draft PR, first tell me if it's possible

> no i only want to plan for PR icon not dot nothing nonsense

The investigation that preceded this change established:

1. **Two surfaces carry PR color today, and they deliberately disagree.** The right-edge **row PR glyph** (`GitPullRequestIcon`, `data-testid="row-pr-glyph"`) is GitHub-styled via `prGlyphColor` — red for fail-ish, green for open, purple for merged. The **status dot** is *not* GitHub-styled: hue encodes the phase/family (purple `pr` for fab-pipeline, orange `agentPr` for ad-hoc-agent) and PR status rides the orthogonal `DotShape` axis.
2. **`prIsDraft` is already plumbed end to end.** GitHub GraphQL `isDraft` (`app/backend/internal/prstatus/prstatus.go:208`) → `PRStatus.IsDraft` → SSE hub attach (`app/backend/api/sse.go:1156`) → JSON `prIsDraft` (`app/backend/internal/tmux/tmux.go:463`) → `WindowInfo.prIsDraft` (`app/frontend/src/types.ts:108`). **No backend work is required.**
3. **Draft is currently, deliberately, not a distinct visual state.** `prDotState` classifies a passing draft as `healthy` under the documented rule "GREEN MEANS HEALTH, NOT MERGE-READINESS", pinned by a test named for it (`pr-status-model.test.ts:41`) and a row test (`window-row.test.tsx:357`). The one surface that acknowledges draft is `getPrSegments` (`sidebar/registers.ts:83`), which appends `" (draft)"` to the state word and explicitly does *not* dim it.

The user's second message is a **hard scope boundary**: this change touches the **glyph only**. The status dot, the `DotShape` vocabulary, `prDotState`, and `prShape` are all out of scope and must not be modified.

## Why

**The problem.** A draft PR and a ready-for-review PR are visually identical in the sidebar today — both render a green `GitPullRequestIcon` when checks pass. But they mean opposite things to the person scanning the list: a ready PR is waiting on *someone else* (review, merge), while a draft is still waiting on *me*. The row glyph exists precisely to make "which of my windows have PRs, and how are they doing" answerable by scanning rather than by decoding a 7px dot, and today it silently collapses the single most actionable distinction in a PR's early life.

**The consequence of not fixing it.** The user has to open the flyout card or the Pane panel's L3 register — the only surfaces that carry the `" (draft)"` text — to answer a question the glyph is supposed to answer at a glance. That defeats the glyph's stated purpose. With several concurrent changes in flight (the normal run-kit working mode) the drafts are exactly the rows the user still owes work to, and they are the ones hiding in a sea of identical green.

**Why this approach over alternatives.**

- **Why the glyph and not the dot.** Directly instructed by the user. It is also the architecturally cheap surface: the glyph's color axis is a single pure function returning a Tailwind token, whereas the dot's hue axis is owned by the two-family channel model (cool = fab pipeline, warm = ad-hoc agent) and adding a draft hue there would break the family-identity glance rule that the whole palette-v3 design rests on. On the dot, draft would have to become a new `DotShape`, requiring new hand-drawn geometry in `status-dot.tsx` plus entries in three label maps — a materially larger and riskier change.
- **Why gray rather than a new color.** GitHub itself renders draft PRs gray, so the mapping is already in the user's head. `text-text-secondary` is the established "inert / no journey" token in this exact model — it is `PHASE_HUE.none` and the color the `skipped` shape forces in `status-dot.tsx:72`. Introducing a new muted token or a raw hex would contradict the immediately-preceding glyph commit (#528, `f0dd111c`), whose own note is "No new color system, no new hex."
- **Why color-only rather than a second icon.** GitHub ships a distinct dashed draft-PR glyph, but color is the glyph's established status axis here and the Sidebar Row Icon System (`260724-2bmy`) pins one icon system per surface. A second SVG is more maintained surface for one bit of information that color already carries.

## What Changes

### 1. `prGlyphColor` gains a draft branch

`app/frontend/src/components/pr-status-model.ts` (currently lines 241–253). The function grows exactly one condition:

```ts
export function prGlyphColor(win: WindowInfo): string {
  if (prDotState(win) === "fail") return "text-red-400";
  if (win.prState === "open" && win.prIsDraft) return "text-text-secondary";
  return win.prState === "open" ? "text-accent-green" : "text-purple-400";
}
```

**The precedence is load-bearing and must be exactly this order:**

- **Fail stays on top.** A draft whose checks are failing (or that has changes requested) reads **red**, not gray. This preserves the existing codebase-wide rule that `isFailish` dominates — the same rule `prDotState` encodes with `fail` ahead of `healthy`, and the same rule the current glyph already follows.
- **Draft is gated on `prState === "open"`.** A merged or closed PR can never be draft in practice (GitHub un-drafts on merge), and the gate makes that structural rather than incidental: the merged→purple and closed→(no glyph) paths are untouched *by construction*, not by luck. This also means draft only ever displaces the open-green case.

The doc comment immediately above the function (lines 241–249) enumerates the current mapping ("green for open, purple for merged") and must be updated to include draft and to state the precedence rationale above.

### 2. Unit tests for the new mapping

`app/frontend/src/components/pr-status-model.test.ts`, inside the existing `describe("prGlyphColor — rest-glyph color mapping")` block (currently lines 92–122). Add:

- open + `prIsDraft: true` + `prChecks: "pass"` → `"text-text-secondary"`
- open + `prIsDraft: true` + `prChecks: "fail"` → `"text-red-400"` (fail still wins over draft)
- open + `prIsDraft: true` + `prReview: "changes_requested"` → `"text-red-400"` (`isFailish` covers review too)
- merged + `prIsDraft: true` → `"text-purple-400"` (unreachable in practice; pins that the draft branch is open-gated)

The block's header comment (currently "red ONLY for fail-ish, then GitHub-style by state: green for open, purple for merged") needs the draft case added.

### 3. Row-level render assertion

`app/frontend/src/components/sidebar/window-row.test.tsx`, near the existing glyph assertions (~line 449–490). Add one test that a window with `prNumber` + `prState: "open"` + `prIsDraft: true` renders `row-pr-glyph` with a className containing `text-text-secondary`.

**Explicitly do NOT touch** the existing test at `window-row.test.tsx:357` ("renders a purple solid for a draft with passing checks (green=health → solid)"). It asserts the **dot**, it remains correct, and after this change it documents the deliberate split between the two surfaces: the dot stays family-hued, the glyph goes gray.

### 4. Inline comment in the row

`app/frontend/src/components/sidebar/window-row.tsx` lines 512–513 currently read:

```
Color via the shared PR vocabulary (prGlyphColor):
green open, purple merged, red failing.
```

Update to include the draft case. No JSX change — the glyph already renders `${prGlyphColor(win)}` into its className, so the new token flows through with no structural edit.

### 5. Memory doc update

`docs/memory/run-kit/ui-patterns.md`, the same two sentences commit `f0dd111c` (#528) edited when it flipped open from purple to green:

- **Line ~164** (§ Shared PR vocabulary → Module surface): the `prGlyphColor` bullet enumerating the token mapping.
- **Line ~1267** (§ Window rows → Gate + color): "Color is `prGlyphColor(win)` from the shared PR vocabulary — red for a fail-ish PR, green for open, purple for merged."

Both should state the four-way mapping and note that draft is open-gated and sits below fail.

### Known limitation to record, not fix

`prIsDraft` is **collector-join-only**. When the URL-keyed collector join misses — a PR aged out of the viewer's top-`$limit` GraphQL window — `sse.go:1148` resets `PrIsDraft` to `false` while `prState` survives via the branch refresher's `MapBranchState` fallback. Such a draft renders as a normal green open PR.

This is **accepted, not fixed, in this change**: the degradation is graceful (it falls back to exactly today's behavior, never to something wrong) and the glyph is `aria-hidden` decoration. Fixing it means adding `isDraft` to the `--json` field list in `branchPRExec` and carrying it through the `BranchPR` struct (`app/backend/internal/prstatus/prstatus_branch.go`) — backend work, outside the user's "glyph only" boundary. It should be captured as a follow-up rather than silently absorbed.

## Affected Memory

- `run-kit/ui-patterns`: (modify) Update the `prGlyphColor` token mapping in § Shared PR vocabulary (Module surface bullet) and the Gate + color sentence in § Window rows to record the four-way mapping — red fail-ish, gray open-draft, green open, purple merged — plus the open-gating of the draft branch and its position below fail in the precedence chain.

## Impact

**Frontend, 5 files. No backend, no API, no new dependency, no new CSS.**

| File | Change |
|------|--------|
| `app/frontend/src/components/pr-status-model.ts` | One condition in `prGlyphColor` + its doc comment |
| `app/frontend/src/components/pr-status-model.test.ts` | 4 unit cases + block header comment |
| `app/frontend/src/components/sidebar/window-row.test.tsx` | 1 render assertion |
| `app/frontend/src/components/sidebar/window-row.tsx` | Inline comment only (no JSX change) |
| `docs/memory/run-kit/ui-patterns.md` | 2 sentences |

**Not touched** (scope boundary, per the user's explicit instruction): `status-dot.tsx`, `status-dot-label.ts`, `prDotState`, `prShape`, `PHASE_HUE`, `DotShape`, `DotPhase`, `sidebar/registers.ts` (its `" (draft)"` text segment is already correct), `sidebar/row-flyout-card.tsx`, and the entire Go backend.

**Token reuse only** — `text-text-secondary` is an existing theme token (`--color-text-secondary`: `#7a8394` dark, `#6b7280` light, `app/frontend/src/globals.css`). No new hex, no `themes.ts` change.

**Testing**: Vitest unit tests only. No e2e change is required — `row-flyout.spec.ts` asserts glyph *presence* and hide-on-hover behavior, not color, so it is unaffected. Per the Test Companion Docs constitutional rule, no `.spec.md` update is needed because no `.spec.ts` is modified.

## Open Questions

- Does `text-text-secondary` stay legible against the sidebar row background in the **light** theme (`#6b7280` on `#ffffff`/`#f8f9fb`)? It is already used for the gray floor dot, so the precedent exists, but a 13px line-art glyph has a thinner ink footprint than a 7px filled dot and is worth an eyeball check at apply time.
- Should the collector-join-miss draft fidelity gap (a draft rendering green when the URL join misses) be filed as a follow-up change now, or left as the documented limitation recorded in this intake?

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Scope is the row PR glyph only — the status dot, `DotShape`, `prDotState`, and `prShape` are untouched | Explicit and emphatic user instruction ("no i only want to plan for PR icon not dot"); a hard boundary, not an inference | S:95 R:90 A:95 D:95 |
| 2 | Certain | Precedence is fail → draft → open-green → merged-purple, with the draft branch gated on `prState === "open"` | Mirrors the existing `isFailish`-dominates rule already encoded in `prDotState` and the current `prGlyphColor`; the open-gate makes merged/closed structurally unreachable rather than incidentally so | S:70 R:85 A:90 D:85 |
| 3 | Certain | The existing dot-level draft test (`window-row.test.tsx:357`, purple solid for a passing draft) is left untouched | It asserts the dot, which is out of scope; it stays correct and now documents the deliberate dot-vs-glyph split | S:65 R:90 A:90 D:85 |
| 4 | Certain | No change to `sidebar/registers.ts` or the row flyout card | `getPrSegments` already renders `" (draft)"` in its state segment; the text surfaces already carry draft, only the glyph lacked it | S:60 R:90 A:90 D:85 |
| 5 | Confident | Draft renders as `text-text-secondary` (existing gray token), not a new token or hex | GitHub renders drafts gray; the token is already the "inert" color in this exact model (`PHASE_HUE.none`, the `skipped` shape); the preceding glyph commit #528 explicitly pins "No new color system, no new hex". User did not name a color — recommended in the plan they acted on | S:55 R:90 A:85 D:70 |
| 6 | Confident | One `GitPullRequestIcon`, varied by color — no separate dashed draft SVG | Color is the glyph's established status axis, and the Sidebar Row Icon System (`260724-2bmy`) pins one icon system per surface; a second SVG is more surface for one bit color already carries | S:50 R:85 A:75 D:60 |
| 7 | Confident | The collector-join-miss draft gap is documented as a known limitation, not fixed | Fixing it requires `isDraft` in `branchPRExec` + the `BranchPR` struct — backend work outside the user's glyph-only boundary; the degradation is graceful (falls back to today's exact behavior) and the glyph is aria-hidden decoration | S:60 R:75 A:70 D:65 |

7 assumptions (4 certain, 3 confident, 0 tentative, 0 unresolved).
