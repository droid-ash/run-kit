# Intake: Hover Card Register Bands

**Change**: 260817-fkad-hover-card-register-bands
**Created**: 2026-08-17

## Origin

Conversational. The user posted a screenshot of the window flyout card open on a window with both a fab change and a PR, and wrote:

> The section which contains the text "PR ready, active till checked 12 seconds ago" contains six text items at max. When the PR is active there are several states to it. When there is less text and when there is PR, it has more text. Can you help me suggest better ways we can organize this section or present this information in a better way using UI or text?

Three layouts were worked up against the real resolvers and measured against the card's actual width. The user picked the middle one:

> Option B — A + two labelled

So the design is settled: **reorder the register strings so only expendable text truncates, and group the result under two labelled bands.** The recommendation to drop the status-label line was carried in all three options and is included here.

This is a **new feature, deliberately separate** from `260817-nwz9-flyout-card-elevation-action-tray` (merged as PR #643, now archived), which changed the card's surface and action rows and touched none of the register content.

## Why

**The card is 320&nbsp;px wide.** At the card's 12&nbsp;px monospace that is about **42 characters** of usable width after the `px-2` padding. Three separate problems follow from what gets packed into it.

### 1. The wrong half of the fab line gets cut

`getFabLine` composes `<id> <slug> · <stage>[ · <displayState>]`. For a real window that is:

```
fab n927 branch-channel-draft-flag · review
```

43 characters into a 42-character line, so the tail is dropped and the card renders `· re…`. The token lost is the **stage** — the reason you opened the card. The token kept is the slug, which is already on the row you are hovering. The priority is exactly backwards.

### 2. The PR line has no width ceiling at all

`getPrSegments` emits up to four independent facts — number, state (± draft), checks, review. The widest reachable state is:

```
pr  #540 · open (draft) · checks pending · review: changes requested
```

**68 characters in a 42-character space.** Nothing caps it, because each segment is appended independently. Checks and review are suppressed once the PR is merged or closed, so the same line also renders as short as `pr  #540 · merged` — a 4× swing with no layout that accommodates both.

### 3. The first line can contradict the fifth

The body's first line is `dotLabel(win, state)` — the status dot's own words. The screenshot shows it reading `PR-ready — active` directly above a `pr` register reading `merged`. Both are correct: the first describes where the change sits in the local fab pipeline, the fifth describes GitHub. Nothing on screen signals that they measure different things, so it reads as a bug.

That line is also **redundant by construction**: you are hovering the dot it describes, and `docs/memory/run-kit/ui/status-signals.md` already records it as "the demoted dot-label body line". It is the least informative line on the card and the most likely to look wrong.

### Also

`checked 12s ago` is the age of the PR poll specifically, but it renders as an unprefixed line at the bottom of the block, so it reads as a statement about the whole card rather than about the PR line above it.

### Consequence of not fixing

This card is the app's one status-detail surface, and on coarse pointers it is the only place these facts appear at all. Today its most valuable field is the one guaranteed to be truncated.

### Why bands rather than just reordering

Reordering alone (the option-A half) stops the truncation but leaves four unrelated stories in one flat list. The two bands encode the distinction that is already true of the data: `out`/`agt` describe **this second**, `fab`/`pr` describe **where the work has got to**. Naming that split is what stops `PR-ready` and `merged` reading as a contradiction, and it makes the card shrink in whole groups on quiet panes instead of leaving gaps.

## What Changes

### 1. Resolvers return parts, not pre-joined strings (`registers.ts`)

`registers.ts` is consumed by **two** surfaces — the flyout card and the bottom PANE panel (`status-panel.tsx`). Its module doc states the point explicitly: one source, no drift. Mutating the joined strings would silently restyle the PANE panel, which this change has no mandate to touch.

So each resolver gains a parts-returning form, and the existing string form is kept as a thin join over it:

```ts
export type FabParts = { id: string; slug: string; stage: string; displayState?: string };

/** Structured form — the card composes its own layout from these. */
export function getFabParts(win: WindowInfo): FabParts | null { … }

/** Existing joined form, now a formatter over getFabParts. Byte-identical
 *  output to today's, so the PANE panel is unchanged. */
export function getFabLine(win: WindowInfo): string | null { … }
```

Same treatment for `getOutputLine` / `getAgentLine`. `getPrSegments` already returns structured segments and needs no change.

**The PANE panel must render byte-identically after this change.** That is the acceptance bar, not a nice-to-have.

### 2. Critical tokens first (`row-flyout-card.tsx`)

The card composes from the parts so the short, decisive tokens lead and the long optional one trails onto a dim continuation line where truncating it costs nothing:

```
fab  n927 · review · active
     branch-channel-draft-flag
```

`n927 · review · active` is 22 characters — it fits with room to spare. The slug gets its own line and may truncate freely.

The same rule applies to `pr`: identity and state on the first line, the health segments continuing below.

```
pr   #540 · open (draft) ↗
     checks pending · changes requested
     checked 12s ago
```

### 3. Freshness joins the PR block

`FreshnessLine` moves inside the `pr` group as a further continuation line, indented to the value column. It renders only when the `pr` register renders — today it can appear with no PR line above it whenever `prFetchedAt` is present but `prNumber` is not.

### 4. The status-label line is removed

Delete the `dotLabel(win, state)` body line from `WindowFlyoutContent`. `dotLabel` stays exported and stays the status dot's `aria-label` — this removes one consumer, not the function.

Accessibility is unaffected: the dot carries the same string as its accessible name, and it sits in the row the card is anchored to.

### 5. Two labelled bands

```
RIGHT NOW
out  active · claude
agt  idle 232h

THIS CHANGE
fab  n927 · review · active
     branch-channel-draft-flag
pr   #540 · open (draft) ↗
     checks pending · changes requested
     checked 12s ago
```

Band headings are ~10&nbsp;px uppercase `text-text-secondary`, letter-spaced, quiet enough to read as chrome.

**Each band renders only when it has content.** A plain shell pane has no agent, no change and no PR, so it shows the "right now" band with a single `out` line and no second band — not an empty heading. A window with an agent but no fab change shows both lines of band one and no band two.

### Worked examples across the range

Plain shell pane:
```
RIGHT NOW
out  zsh — idle 4m since last output
```

Agent window, no change:
```
RIGHT NOW
out  active · claude
agt  waiting 3m
```

Full case (the screenshot):
```
RIGHT NOW
out  active · claude
agt  idle 232h

THIS CHANGE
fab  n927 · review · active
     branch-channel-draft-flag
pr   #540 · merged ↗
     checked 12s ago
```

### Non-goals

- **The PANE panel's appearance.** It keeps today's joined strings and today's layout. Only its data source is refactored beneath it.
- **Chips and a stage rail** (the option-C proposal). Held deliberately — worth revisiting only if the PR block still reads dense after this lands.
- **Renaming the `out`/`agt`/`fab`/`pr` prefixes.** They stay. `260723-fm08` is separately adding tier-1 tooltips that name them, which is the better fix for their terseness.
- The card's surface, elevation, action rows or tray — all shipped in `nwz9` and untouched here.

### Coordination with in-flight work

- **`260723-fm08-register-label-chip-tooltips`** (apply, active) has already landed `tipLabel` tooltips on the register **prefix** spans in `status-panel.tsx`. This change touches register **values** and the card's layout, so the surfaces do not overlap — but both files are in play, so rebase order matters.
- **`260810-aqo6-statusdot-compositional-vocabulary`** (intake, ready) reworks what the status dot encodes. Dropping the card's textual echo of `dotLabel` means the dot must carry its meaning without a text backup on this card. That is aqo6's own goal, so the two are aligned rather than in conflict.

## Affected Memory

- `run-kit/ui/status-signals`: (modify) § Row-hover register flyout card. The body-line anatomy changes: the "demoted dot-label body line" described around line 165 is removed, the four registers gain the two-band grouping and the continuation-line rule, and the freshness line moves inside the `pr` group. The Tests paragraph around line 185 needs the new assertions.
- `run-kit/ui/sidebar`: (modify) only if its description of the card body references the status-label line; verify during hydrate rather than assuming.

`docs/specs/status-pyramid.md` is **not** affected — the L0–L3 pyramid model, the register vocabulary and the ownership rules are unchanged. This change alters presentation only.

## Impact

**Code** (3 files + tests):

| File | Change |
|---|---|
| `app/frontend/src/components/sidebar/registers.ts` | Add parts-returning resolvers; existing string resolvers become formatters over them |
| `app/frontend/src/components/sidebar/row-flyout-card.tsx` | Remove the `dotLabel` line, compose from parts, add band headings + continuation lines, move `FreshnessLine` into the `pr` group |
| `app/frontend/src/components/sidebar/status-panel.tsx` | No behavioral change — verify byte-identical rendering |
| `registers.test.ts`, `row-flyout-card.test.tsx` | Parts resolvers, band gating, continuation lines, removed label line |
| `tests/e2e/row-flyout.spec.ts` (+ `.spec.md`) | The spec asserts on card body text; update both together per the Constitution |

**Surfaces**: the window flyout card on both pointer types, and the session/server card tiers only insofar as they share the shell (they render their own facts line, not these registers — verify no regression).

**No change to**: the Go backend, the API, `WindowInfo`, the status dot, the PANE panel's appearance, or the card's surface/action rows.

**Verification**: `npx tsc --noEmit`, `PNPM_CONFIG_STRICT_DEP_BUILDS=false just test-frontend`, `just test-e2e`, `just build`. Visual check per the project's Playwright-driven workflow at 375&nbsp;px and 1024&nbsp;px+, in both themes, across at least three window shapes (plain shell / agent only / fab + PR).

## Open Questions

None. The layout was chosen from three rendered options measured against the real resolvers; the remaining decisions are recorded below.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Implement Option B — reordering plus two labelled bands — not A alone or C | User reviewed three measured options and named B explicitly | S:90 R:70 A:90 D:95 |
| 2 | Certain | Band headings render only when their band has content | Otherwise a plain shell pane shows an empty "this change" heading, which is worse than today | S:75 R:90 A:95 D:95 |
| 3 | Confident | Resolvers gain parts-returning forms; the existing string forms stay as formatters | `registers.ts` is shared with the PANE panel and its module doc commits to one source, no drift; mutating the strings would restyle a surface this change has no mandate to touch | S:60 R:75 A:90 D:80 |
| 4 | Confident | The PANE panel must render byte-identically; that is an acceptance item, not a hope | It is the blast radius most likely to be missed, and the only way the refactor can go wrong invisibly | S:65 R:80 A:90 D:85 |
| 5 | Confident | Drop the `dotLabel` body line; accessibility rides the dot's own `aria-label` | The card is anchored to the row whose dot carries the identical string; memory already calls this line "demoted" | S:70 R:85 A:80 D:75 |
| 6 | Confident | Band labels read "right now" and "this change" | Taken from the reviewed mockup the user selected; plain words, no product jargon | S:60 R:95 A:70 D:70 |
| 7 | Confident | Long values continue on an indented dim line rather than truncating | Keeps the decisive tokens on the first line and makes truncation harmless where it still happens | S:65 R:85 A:85 D:80 |
| 8 | Confident | The 3-char prefixes stay as they are | `260723-fm08` is separately adding tooltips that name them; renaming would collide with in-flight work and churn two surfaces | S:60 R:85 A:85 D:85 |
| 9 | Confident | Freshness renders only alongside the `pr` register | Today it can render with no PR line above it when `prFetchedAt` is set but `prNumber` is not, which is the orphan this change is fixing | S:60 R:90 A:85 D:80 |
| 10 | Confident | Session and server card tiers are unaffected | They pass their own one-line facts content through the shared shell rather than these register resolvers; verify no regression rather than assuming it | S:55 R:85 A:85 D:80 |

10 assumptions (2 certain, 8 confident, 0 tentative, 0 unresolved).
