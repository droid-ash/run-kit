# Intake: Source the PR Draft Flag from the Branch Channel

**Change**: 260807-n927-branch-channel-draft-flag
**Created**: 2026-08-07

## Origin

**Adopted from the branch `260807-n927-branch-channel-draft-flag`** (no PR existed at adoption time). The code was authored **off-pipeline** — directly as commit `9ce484a6` ("fix: Source the PR Draft Flag from the Branch Channel", `Co-Authored-By: Claude Opus 5`) without going through fab — and is being brought into the pipeline via `/fab-adopt`. This intake is **reverse-engineered from the diff** plus the commit message; it describes code that already exists rather than planning code to be written.

The commit was authored on top of the `260807-e30p-draft-pr-row-glyph-color` branch **after** that branch's PR (`sahil87/run-kit#536`) had already merged as `04a7b13f`, so it was never part of #536. For adoption it was cherry-picked onto a fresh branch off the synced `main` (`ed7fa725`), where it applies cleanly — the two changes touch disjoint file sets (e30p was frontend-only, this is backend-only).

**This change closes a limitation that e30p deliberately shipped as documented.** `docs/memory/run-kit/ui-patterns.md:1291` records it under "Draft fidelity is collector-join-only" and names the exact remedy: *"Closing it is backend work — `isDraft` in `branchPRExec`'s `--json` field list, carried through the `BranchPR` struct."* That is precisely what this diff does.

## Why

**The problem — and it is worse than e30p's intake believed.** e30p taught the sidebar's rest-state PR glyph to render an open **draft** PR in gray (`text-text-secondary`) instead of open-green. But `prIsDraft` was supplied **exclusively** by the viewer-wide collector, whose GraphQL query is `viewer { pullRequests }` — *the authenticated user's own PRs*. So the gray-draft state only ever fired for **your own** drafts. A draft opened by a **teammate** was resolved by the branch channel (which is author-agnostic) but missed the URL-keyed collector join entirely, and `attachPRStatus` wiped `PrIsDraft` back to `false` before the join — so it rendered as a plain green open PR with no signal that the flag was merely *absent* rather than *false*.

e30p's intake characterized this as a top-`$limit` window problem: "a PR aged out of the viewer's top-`$limit` GraphQL window." That framing understated it. A teammate's draft is **never** in `viewer { pullRequests }` at any limit — it is not a pagination edge case, it is a categorical miss. The feature worked for exactly one author: you.

**The consequence of not fixing it.** The glyph's stated purpose is to make "which of my windows have PRs, and how are they doing" answerable by scanning. In a shared repo, the drafts most worth spotting are often *not* your own — a teammate's draft is precisely the row you should not be waiting on. Leaving the flag collector-only means the gray state silently misinforms in the multi-author case that motivates the sidebar in the first place, and does so **indistinguishably** from a correct non-draft rendering.

**Why this approach over alternatives.**

- **Why the branch channel.** It is already the author-agnostic PR resolver (`gh pr list --head <branch>`), it already runs every `FetchSessions` tick, and it already seeds `PrState` the same way. Adding one field to a `--json` list it already requests is the smallest possible intervention — no new network call, no new cache, no new refresh clock.
- **Why dual-source rather than move.** The collector still overrides on a URL hit, exactly as it does for `PrState`. Both channels ultimately read GitHub, so they cannot disagree in practice; keeping the collector authoritative on a hit preserves the existing precedence and avoids a behavioral change for the self-authored case that already worked.
- **Why dropping the wipe-on-miss is safe.** This mirrors the precedent `PrState` already set. `FetchSessions` rebuilds `WindowInfo` from tmux every tick, so there is no persistent struct in which a stale value could linger — the seed is refreshed within one 500ms cache generation.
- **Rejected: widening the collector's query.** Querying beyond `viewer { pullRequests }` (e.g. a repo-wide search) would enlarge an already rate-limit-sensitive GraphQL call to fix a field the cheap branch channel can supply directly, and would still leave the wipe-on-miss bug for any PR outside whatever new window was chosen.

## What Changes

**Backend only, 6 files. No frontend change** — `prIsDraft` was already on the `WindowInfo` JSON contract and already consumed by `prGlyphColor`; only its *fidelity* changes.

### 1. `BranchPR` carries `IsDraft`

`app/backend/internal/prstatus/prstatus_branch.go`. The struct gains an `IsDraft bool \`json:"isDraft"\`` field, and `branchPRExec`'s `gh pr list` `--json` field list grows from `number,url,state,updatedAt` to `number,url,state,updatedAt,isDraft`. The doc comments explain *why* the field lives on the branch channel (the `viewer { pullRequests }` blind spot) rather than only on the collector.

### 2. `enrichWindowPR` seeds the flag

`app/backend/internal/sessions/sessions.go`. Alongside the existing `w.PrState = prstatus.MapBranchState(pr.State)`, the enrichment now sets `w.PrIsDraft = pr.IsDraft`. The comment block above the function is extended to record the sharper reason this seed exists, parallel to the existing `PrState` rationale.

### 3. `attachPRStatus` stops wiping the flag

`app/backend/api/sse.go`. The collector-only reset drops `PrIsDraft`:

```go
// before
w.PrChecks, w.PrReview, w.PrIsDraft, w.PrFetchedAt = "", "", false, nil
// after
w.PrChecks, w.PrReview, w.PrFetchedAt = "", "", nil
```

`PrIsDraft` joins `PrState` as **dual-sourced**: the branch seed survives a collector miss, and the collector still overrides on a URL hit. The function's doc comment is rewritten to describe both dual-sourced fields together and to state explicitly that a teammate's draft is "never in `viewer { pullRequests }` at all, whatever the limit."

### 4. `WindowInfo` field-ownership comments

`app/backend/internal/tmux/tmux.go`. The PR-fields comment block is corrected: Layer 1 (the sessions enrichment join) now seeds branch-derived `PrState` **and** `PrIsDraft`; Layer 3 (the SSE hub's collector snapshot) owns `PrChecks`/`PrReview` and overrides the two dual-sourced fields on a hit. `PrFetchedAt`'s comment is corrected to list only `PrChecks`/`PrReview` as its collector-join-owned siblings.

### 5. Tests

- `app/backend/api/pr_status_test.go` — `TestAttachPRStatusResetsCollectorFields` asserted the **old** wipe-on-miss behavior and is updated to the new spec. Per the constitution's Test Integrity rule, tests conform to the spec, not the reverse. Coverage added for both halves of the dual-source contract (seed survives a miss; collector overrides on a hit).
- `app/backend/internal/prstatus/prstatus_branch_test.go` — coverage that `isDraft` survives the branch-PR parse.

## Affected Memory

- `run-kit/ui-patterns`: (modify) The **"Draft fidelity is collector-join-only"** paragraph (`ui-patterns.md:1291`, attributed `e30p`) is now **factually wrong** and must be rewritten. Its claim that `prIsDraft` "reaches the frontend only through the URL-keyed collector join" no longer holds, and its framing of the gap as a top-`$limit` aging problem understated it — the real blind spot was `viewer { pullRequests }` excluding every other author's PRs. Record instead that the flag is dual-sourced (branch seed + collector override on hit), that a teammate's draft now renders gray correctly, and that the named follow-up it pointed at is closed by `n927`.
- `run-kit/architecture`: (modify) **Four stale claims**, all located and read against the diff:
  1. `architecture.md:548` — the `attachPRStatus` description lists `PrChecks/PrReview/PrIsDraft` as the **collector-only** fields reset on every window and singles out `PrState` as "deliberately NOT reset here … dual-sourced". `PrIsDraft` must move from the collector-only set into the dual-sourced set alongside `PrState`.
  2. `architecture.md:548` — the `PrFetchedAt` sentence in the same paragraph calls it "collector-join-owned exactly like the `PrChecks`/`PrReview`/`PrIsDraft` siblings"; `PrIsDraft` must be dropped from that sibling list.
  3. `architecture.md:116` — states `BranchPR` carries `Number`/`URL`/`State`/`UpdatedAt` and explicitly that "`IsDraft` stays trimmed — **no consumer**". This change re-adds `IsDraft` **with** a consumer (`enrichWindowPR`), so that parenthetical is now false and must be rewritten.
  4. `architecture.md:116` **and** `:556` — both quote the branch query as `gh pr list --head <branch> --state all --json number,url,state,updatedAt`. Both must gain `,isDraft`.

## Impact

**Go backend, 6 files. No frontend, no API shape change, no new dependency, no new config.**

| File | Change |
|------|--------|
| `app/backend/internal/prstatus/prstatus_branch.go` | `BranchPR.IsDraft` field + `isDraft` in the `--json` list + comments |
| `app/backend/internal/sessions/sessions.go` | `enrichWindowPR` seeds `w.PrIsDraft` + comment |
| `app/backend/api/sse.go` | `attachPRStatus` drops `PrIsDraft` from the reset + rewritten doc comment |
| `app/backend/internal/tmux/tmux.go` | Field-ownership comments only (no behavior) |
| `app/backend/api/pr_status_test.go` | Updated reset test + dual-source coverage |
| `app/backend/internal/prstatus/prstatus_branch_test.go` | `isDraft` parse coverage |

**Not touched**: the entire frontend (`prGlyphColor` and the `prIsDraft` JSON contract are unchanged — only the flag's fidelity improves), the collector's GraphQL query, any cache or refresh clock, and `themes.ts`/`globals.css`.

**No API contract change** — `prIsDraft` was already an `omitempty` bool on the `WindowInfo` JSON. Clients see the same field, more often correctly populated.

**Verification**: the author reports verifying against a live daemon (a teammate's draft PR arriving with `prIsDraft: true` and its row glyph rendering `text-text-secondary`, while open and merged rows kept green and purple). **Backend tests could not be re-run during adoption** — no Go toolchain is installed in this environment (`just test-backend` fails with `go: not found`), so the `Backend (go test)` CI job on the PR is the verification gate.
<!-- assumed: local backend-test verification deferred to CI — no Go toolchain available in the adoption environment -->

## Open Questions

- e30p's memory paragraph asserted that "every draft surface degrades together rather than disagreeing," because `getPrSegments`' `" (draft)"` suffix reads the same `prIsDraft` field. That is still true, and the fix lifts all of those surfaces at once — but is there any consumer of `prIsDraft` that *relied* on the collector-only timing (i.e. expected the flag to be absent until a collector hit)? A grep found only the glyph and the register text, so this is very likely a no, worth one confirming pass at review.
- Should the branch channel's `isDraft` also be surfaced on the `PrFetchedAt` freshness line, given the flag can now arrive from a channel with a different (500ms) refresh cadence than the collector it reports on? Out of scope for this change; the freshness line still describes the collector join only.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Scope is backend draft-flag sourcing only — no frontend change | The diff touches 6 backend files and zero frontend files; `prIsDraft` was already on the `WindowInfo` JSON contract and already consumed by `prGlyphColor`, so only fidelity changes | S:95 R:85 A:95 D:95 |
| 2 | Certain | This change closes the exact limitation e30p documented and deferred | `ui-patterns.md:1291` names the remedy verbatim — `isDraft` in `branchPRExec`'s `--json` list carried through `BranchPR` — and the diff does precisely that | S:90 R:90 A:95 D:90 |
| 3 | Certain | Affected memory is `run-kit/ui-patterns` (the :1291 fidelity paragraph) and `run-kit/architecture` (the :548 `attachPRStatus` field-ownership sentences) | Both located by grep and read against the diff; each makes a claim about `PrIsDraft` ownership that this change invalidates | S:85 R:90 A:90 D:85 |
| 4 | Certain | `PrIsDraft` becomes dual-sourced exactly like `PrState` — branch seed, collector overrides on a URL hit | Plainly visible in the diff (the reset drops the field, the hit-path assignment is unchanged) and stated in the commit message | S:80 R:75 A:85 D:80 |
| 5 | Confident | Dropping the wipe-on-miss cannot strand a stale value | `FetchSessions` rebuilds `WindowInfo` from tmux every tick, so no persistent struct holds the field; this is the same argument that already exempts `PrState`, and the seed refreshes within one 500ms cache generation | S:70 R:65 A:75 D:70 |
| 6 | Confident | No frontend or e2e test change is required | The JSON field name and type are unchanged, so no frontend type or fixture moves; the affected behavior is exercised by Go tests at the seed/override boundary | S:70 R:85 A:80 D:75 |
| 7 | Tentative | Local backend-test verification is deferred to the PR's `Backend (go test)` CI job | No Go toolchain exists in this environment (`just test-backend` → `go: not found`), so the tests genuinely cannot be run here. Mitigated by the author's live-daemon verification and by CI having run green on the sibling e30p PR, but unverified locally at adoption time | S:50 R:55 A:30 D:50 |

7 assumptions (4 certain, 2 confident, 1 tentative, 0 unresolved).
