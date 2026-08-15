# Intake: Terminal Tile Content Verbs

**Change**: 260813-w1lf-terminal-tile-content-verbs
**Created**: 2026-08-13

## Origin

Conversational — a `/fab-discuss` session reviewing top-bar/tile chrome. The user requested:

> The "Split Horizontal, vertical" combo button on the top bar — works only on the xterm tile. So let's move the buttons to the "Terminal" tile title bar. Also, given we have space there we once again can keep both of them separate buttons. Another thing we can move there — "Close Pane". We need to be sure there's enough distinction between this Close and the Tile close button. Right now all buttons on the tile titlebar are generic — same buttons all title bars, and they are conditional — based on how many tiles there are. This changes that paradigm.

An HTML mock was built during the discussion showing the paradigm framed as **two verb families** (content verbs vs layout verbs), three distinction options for the two destructive closes, and top-bar before/after. The user approved the framing and chose **Option A** for the close distinction ("Yes A"). Mock file (reference only, not shipped): scratchpad `tile-verbs-mock/mock.html`.

## Why

1. **Pain point**: the top-bar SplitControl and the chevron-menu Close Pane act on the tmux pane inside the **tty tile**, but they live in shell-level chrome. On a multi-tile layout (tty | code) nothing about their placement says what they act on — a user focused on the code tile can reasonably expect Split to split the code view. Proximity is the disambiguation: pane operations belong on the tile that hosts the pane.
2. **Consequence of not fixing**: the top bar keeps accumulating controls whose target is invisible, and the merged split-button (primary=horizontal, ▾ for vertical) keeps the vertical direction two clicks away for no space reason — the tile header has room for both directions as one-click buttons.
3. **Why this approach**: the tile header is already per-kind on its left side (tty carries the StatusDot, code/web carry meta chips), so per-kind verbs on the right side are an evolution of the existing design, not a break. The alternative — keeping everything in the top bar — was rejected in discussion; a confirm-on-close variant (Option C) and a "move only the splits" variant (Option B) were rejected in favor of glyph+grouping distinction (Option A).

## What Changes

### Verb families (the paradigm change)

Tile-header verbs split into two families:

- **Layout verbs** (existing, unchanged): ⛶ zoom · ◧ promote · ⇄ swap · ✕ close-tile. Generic — identical on every tile kind. Conditional — render only at arity > 1 (`showVerbs` in `surface-layout.tsx`, currently `!mobile && arity > 1 && slot >= 0`). ◧/⇄ hidden while zoomed; ✕ isolated far right behind a hairline, hover `text-signal-red`. **No changes to this family.**
- **Content verbs** (new): Split H · Split V · Close Pane. Per-kind — rendered on **tty tiles only**. Present at **any arity** — including `single:tty` (whose header renders zero verbs today; splitting the only tile is the primary use case, so the arity condition must not apply). Remain visible while the tile is zoomed (pane ops stay valid on a zoomed tile — only the layout verbs hide there).

### tty tile header (`app/frontend/src/components/surface-layout.tsx`, `renderTile` ~line 646)

Add a **bordered pane segment** (Option A) to the tty header's verb area, placed right-aligned, immediately left of the layout-verb cluster, separated from it by the existing hairline pattern:

```
[dot] [>_] Terminal          [ ◫ ⬒ ⊠ ]  |  ⛶ ◧ ⇄  |  ✕
                              └ pane segment ┘   └ layout verbs ┘
```

- The segment is a bordered rounded container (`border border-border rounded`, ~24px tall) holding the three content-verb buttons, so it reads as "one control about the pane" — visually distinct from the free-floating layout verbs.
- **Split H** and **Split V** are two separate one-click buttons (un-merging the top bar's combined SplitControl). Reuse `SplitHorizontalGlyph` / `SplitVerticalGlyph` from `top-bar-icons.tsx`. Split horizontal = side-by-side (rk's existing vocabulary). They call the same `splitWindow` API (`api/client.ts`) with the current window's `{server, windowId, cwd: worktreePath}` — same arguments the top-bar SplitControl passes today.
- **Close Pane** uses a **boxed ⊠ glyph** (lucide `square-x`: rect + cross — a NEW glyph component in `top-bar-icons.tsx`; deliberately NOT the bare-✕ `ClosePaneGlyph`), hover `text-signal-red`, tooltip wording that states the consequence, e.g. `Close pane — kills the tmux pane`. Immediate action, no confirm dialog (terminal-mode close-pane is deliberately immediate today; Option C's confirm was rejected). Calls the existing `closePane` API for the current window's active pane.
- Distinction contract (the misclick-trap mitigation): different glyph shape (boxed ⊠ vs bare ✕), different grouping (inside the segment vs isolated behind the hairline), spatial separation (opposite ends of the verb area, ~5 buttons apart).
- At arity 1 the layout cluster is absent, so the header shows only the pane segment on the right.
- **Duplicate tty tiles**: both tty tiles render the segment; both act on the same window's active pane (the relay is per-window — harmless duplication, matches how duplicate tty tiles already share the window).
- Verb buttons keep the existing `VERB_BUTTON_CLASS` chrome (22×22, 26×26 coarse, rest opacity 65%).
- Width budget: 7 verbs + dot + label ≈ 250px fits the 280px tile floor (`MIN_PANEL_WIDTH_PX` clamp); the meta chip already truncates first — no new overflow handling required.

### Top bar (`app/frontend/src/components/top-bar.tsx`, `rightItems` registry ~line 521)

- The `split` registry entry stops rendering **in-bar** for terminal mode. Terminal-mode bar end state becomes **Open · ▦ Layout · Refresh · chevron**.
- The chevron-menu rows survive as the mobile path + muscle-memory fallback: **Split H, Split V, and Close Pane rows stay in the chevron menu** for terminal mode (the `menuOnly` demotion mechanism used by fixed-width/Aa in 260731-oiho). Close Pane's row is already menuOnly today — unchanged; the split rows convert from overflow-fallback to menuOnly.
- **Board mode is untouched**: the board keeps its in-bar SplitControl and its consequence-gated Kill row exactly as today (board tiles are separate chrome; out of scope). Implementation likely splits the current dual-mode `split` entry into board (in-bar, unchanged) and terminal (menuOnly) behavior via `modes`/`menuOnly`/`hidden`.
- Palette entries (`Pane: Close`, split actions) are unchanged.

### Mobile

Tile headers do not render on mobile (`renderTile`'s `!mobile` gate) — mobile users reach Split/Close Pane through the chevron menu rows, which is why those rows must remain. No mobile-specific work beyond keeping the rows.

### Tests

- Update/extend Playwright e2e specs covering the top-bar split (terminal mode) and tile-header verbs; per constitution § Test Companion Docs, matching `.spec.md` files update in the same commit.
- New assertions: pane segment renders on tty tile at arity 1 (today: zero verbs), does NOT render on code/web/chat tiles, stays visible while zoomed; terminal-mode bar has no in-bar split chip; chevron menu carries Split H / Split V / Close Pane rows; board-mode top bar unchanged.
- Note for spec-writing: window-row icon clusters need `.hover()` before icon clicks (pointer-events gate); tile verbs are rest-visible so this may not apply, but mutating-route mocks need trailing `*` globs.

## Affected Memory

- `run-kit/ui-patterns`: (modify) top-bar chrome section (terminal-mode end state, menuOnly rows) and surface-layout tile-chrome section (two verb families, pane segment, arity/zoom visibility rules, close-distinction contract)

## Impact

- `app/frontend/src/components/surface-layout.tsx` — tty header pane segment, visibility rules (main change)
- `app/frontend/src/components/top-bar.tsx` — `split` registry entry: terminal mode → menuOnly; board unchanged
- `app/frontend/src/components/top-bar-icons.tsx` — new boxed ⊠ glyph component
- `app/frontend/src/components/surface-layout.test.tsx`, `top-bar.test.tsx` — unit coverage
- `app/frontend/tests/*.spec.ts` + sibling `.spec.md` — e2e coverage for the moved verbs
- No backend changes — both verbs call existing endpoints (`splitWindow`, `closePane`)

## Open Questions

- None — the design decisions were resolved in the originating discussion.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Option A close distinction: boxed ⊠ glyph inside a bordered pane segment; tile ✕ unchanged far right | Discussed — user chose "Yes A" from three mocked options | S:95 R:85 A:95 D:95 |
| 2 | Certain | Splits un-merged into two one-click buttons on the tile header | Discussed — user explicitly asked to "keep both of them separate buttons" | S:95 R:90 A:95 D:95 |
| 3 | Certain | Board mode untouched (keeps in-bar SplitControl + Kill row) | Discussed in mock §4, user approved; board tiles are separate chrome | S:90 R:85 A:90 D:90 |
| 4 | Certain | Chevron menu keeps Split H / Split V / Close Pane rows (menuOnly) as mobile path + fallback | Discussed in mock §4, user approved; tile headers don't render on mobile | S:85 R:90 A:90 D:85 |
| 5 | Confident | Content verbs render at any arity (incl. single:tty) and stay visible while zoomed | Mock §1/§6 stated both rules; user approved the mock framing | S:80 R:80 A:85 D:85 |
| 6 | Confident | Close Pane stays immediate (no confirm) | Option C (confirm) was presented and not chosen; today's terminal-mode close-pane is deliberately immediate | S:75 R:85 A:80 D:80 |
| 7 | Confident | Pane segment placement: right-aligned, left of the layout cluster, hairline-separated | As mocked and approved; alternative left-grouped placement was shown but the approved §2 mock uses right-side segment | S:70 R:85 A:75 D:75 |
| 8 | Confident | Duplicate tty tiles both render the segment, acting on the same window's active pane | Follows the existing duplicate-tty model (N clients per pane); no user signal to differentiate | S:60 R:85 A:80 D:75 |
| 9 | Tentative | Split buttons use the standard verb hover (`hover:text-text-primary`), not accent-green | Mock showed green hover, but existing VERB_BUTTON_CLASS vocabulary uses text-primary hover; styling is trivially reversible <!-- assumed: split-verb hover color follows existing verb chrome, not the mock's green --> | S:45 R:95 A:55 D:50 |

9 assumptions (4 certain, 4 confident, 1 tentative, 0 unresolved).
