# Plan: Source the PR Draft Flag from the Branch Channel

**Change**: 260807-n927-branch-channel-draft-flag
**Intake**: `intake.md`

> Adopted change — code authored off-pipeline. Apply was skipped; this plan is reverse-engineered from the branch diff to feed hydrate.

## Requirements

### Branch-channel draft resolution

The branch PR resolver is the author-agnostic channel: it runs `gh pr list --head <branch>` per window, so it sees a PR regardless of who opened it. It must therefore carry the draft flag, not just the PR's identity and state.

`BranchPR` carries an `IsDraft` boolean, populated by adding `isDraft` to the `gh pr list --json` field list (which already requests `number,url,state,updatedAt`). The field's doc comment records *why* the flag lives here rather than only on the viewer-wide collector: the collector queries `viewer { pullRequests }`, so it only ever returns the authenticated user's own PRs, and a draft opened by anyone else would never reach the client.

### Seeding the window from the branch channel

`enrichWindowPR` (the Layer 1 sessions enrichment join) seeds `WindowInfo.PrIsDraft` from the resolved `BranchPR.IsDraft`, alongside the `PrState` seed it already writes via `MapBranchState`. This runs on every `FetchSessions` tick behind the existing 500ms cache, so no new network call or refresh clock is introduced.

### Preserving the seed across a collector miss

`attachPRStatus` no longer resets `PrIsDraft` to `false` before the URL-keyed collector join. The field becomes dual-sourced in exactly the way `PrState` already is: the branch seed survives a collector **miss**, and the collector still overrides on a **hit**. Only `PrChecks`, `PrReview`, and `PrFetchedAt` remain collector-only fields that are reset unconditionally.

Dropping the reset cannot strand a stale value, for the same reason `PrState` is already exempt: `FetchSessions` rebuilds `WindowInfo` from tmux on every tick, so there is no persistent struct in which an old value could linger beyond one cache generation.

### Field-ownership documentation

The `WindowInfo` PR-fields comment block states the corrected layering: Layer 1 seeds branch-derived `PrState` *and* `PrIsDraft`; Layer 3 (the SSE hub's collector snapshot) owns `PrChecks`/`PrReview` and overrides the two dual-sourced fields on a hit. `PrFetchedAt`'s comment lists only `PrChecks`/`PrReview` as its collector-join-owned siblings.

### Test conformance

`TestAttachPRStatusResetsCollectorFields` asserted the old wipe-on-miss behavior, so it is updated to the new spec rather than the spec being bent to the test — per the constitution's Test Integrity rule. Coverage exists for both halves of the dual-source contract (the seed surviving a miss, and the collector overriding on a hit) and for `isDraft` surviving the branch-PR parse.

### Non-Goals

- No frontend change. `prIsDraft` was already on the `WindowInfo` JSON contract and already consumed by `prGlyphColor`; only the flag's fidelity improves.
- No widening of the collector's GraphQL query beyond `viewer { pullRequests }`.
- No change to the `PrFetchedAt` freshness line, which continues to describe the collector join only.

## Tasks

- [x] Adopted: implementation authored outside the pipeline (commit `9ce484a6`, cherry-picked onto this branch as `fe77f095`).

## Acceptance

- [x] Adopted: code already authored and verified by its author against a live daemon; a diff-only review runs in this pipeline, and the `Backend (go test)` CI job on the PR is the test gate.

## Notes

**Backend tests were not run during adoption.** No Go toolchain is installed in this environment — `just test-backend` fails with `go: not found` — so the PR's `Backend (go test)` CI job is the verification gate. This is recorded as a Tentative assumption on the intake rather than silently absorbed.

**Relationship to `e30p`.** This change closes the limitation `260807-e30p-draft-pr-row-glyph-color` shipped as documented. `docs/memory/run-kit/ui-patterns.md:1291` named the remedy verbatim; this diff implements it. e30p merged upstream as `sahil87/run-kit#536` (`04a7b13f`) before this commit was authored, so the two are sequential rather than overlapping.

## Deletion Candidates

- None — this change adds one field to an existing struct and removes one reset assignment; no existing file, function, branch, or config becomes redundant or unused. (`prstatus.PRStatus.IsDraft` and the collector's `isDraft` GraphQL selection remain live: the collector still overrides `PrIsDraft` on a URL hit.)

## Assumptions

0 assumptions.
