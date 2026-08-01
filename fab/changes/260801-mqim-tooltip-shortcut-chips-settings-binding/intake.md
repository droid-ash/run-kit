# Intake: Tooltip Shortcut Chips + Settings Keybinding

**Change**: 260801-mqim-tooltip-shortcut-chips-settings-binding
**Created**: 2026-08-01

## Origin

Conversational — reported during a `/fab-discuss` session:

> the compose text tooltip doesn't show its keyboard shortcut. Neither does "Settings".

Investigation found two distinct situations: the Compose button has a registry binding (`compose-toggle` = shifted-tier `KeyE`) that its `Tip` simply never surfaces, while Settings has **no keybinding at all** — `settings-open` exists only as a palette command. The user's expectation that Settings shows a shortcut implies one should exist; the discussion proposed adding a `Comma` binding following the existing `macTier`/`macShellOnly` precedent. The user accepted with "kick a fab new for both".

## Why

**Problem**: Tooltip keycap chips (`Tip`'s `kbd` slot) are inconsistently populated. The sidebar-footer "Keyboard shortcuts" button already resolves its chord live from the keybinding registry (260801-sm6g), but the Compose button's Tip shows no chord despite one existing, and the palette button's Tip hard-codes `"⌘K"` (wrong glyph on Windows/Linux). Settings is undiscoverable by keyboard entirely except through the palette.

**Consequence if unfixed**: Keyboard-first discovery (Constitution V) degrades — hover discovery teaches users the mouse path but hides the keyboard path, and a hard-coded chip lies to non-mac users and under user rebinds.

**Why this approach**: extend the proven sm6g pattern (resolve via `useKeybindings()` + `formatCombo`, omit when unbound/disabled — "a tip advertising a dead chord would lie") rather than adding static strings, and add a real registry binding for Settings rather than special-casing its tooltip.

## What Changes

### 1. Compose button Tip gets its registry-resolved chord

`app/frontend/src/components/bottom-bar.tsx:386` — `<Tip label="Compose text" placement="top">` gains `kbd={composeChord}` where:

```tsx
const { byAction, host } = useKeybindings();
const composeBinding = byAction.get("compose-toggle");
const composeChord = composeBinding?.enabled
  ? formatCombo({ code: composeBinding.code, tier: composeBinding.tier }, host.platform)
  : undefined;
```

This mirrors the sidebar footer's `overlayChord` derivation verbatim (`sidebar/index.tsx`, the 260801-sm6g precedent): reflects overrides, omitted when unbound/disabled. If `bottom-bar.tsx` does not already consume `useKeybindings`, add the hook at the component that owns the Tip (check render frequency — the bottom bar is chrome, one hook call is fine).

### 2. Palette button Tip chord becomes platform-aware

Same file, adjacent call site: the palette Tip currently passes a static `"⌘K"` (documented as "the canonical palette shortcut string — a static string per the 73al contract"). Replace with the same derivation for actionId `command-palette` (registry: `KeyK`, `cmd` tier), so Windows/Linux render `Ctrl+K` and rebinds/disables are reflected. Update the stale comment. Sweep the frontend for any other static `kbd=` strings that name a registry-bound action and convert them the same way (known candidates only — do not invent chips for controls without bindings); the `Tip` contract comment in `tip.tsx` ("A STATIC string per call site — no shortcut-registry wiring (deferred follow-up)") should be updated to name the sm6g resolution pattern as the norm for registry-bound actions, since this change completes that deferred follow-up.

### 3. New `settings-open` keybinding

Add to `DEFAULT_BINDINGS` in `app/frontend/src/lib/keybindings.ts`:

```ts
{ actionId: "settings-open", code: "Comma", tier: "shifted", macTier: "cmd", macShellOnly: true, scope: "global", kind: "builtin", label: "Settings", description: "open the settings dialog", mapLabel: "settings", ignoreInputs: true },
```

Chord rationale (agreed in discussion):

- Browsers: shifted tier → ⇧⌘, (mac) / ⇧Ctrl+, (win/linux). The unshifted ⌘, is browser-reserved (Chrome/Safari preferences), so it cannot be the browser default.
- Desktop shell on mac: `macTier: "cmd"` + `macShellOnly: true` promotes it to the OS-conventional **⌘,** — exactly the `create-session` (⌘N) precedent. The shell binds no accelerator on ⌘, and `MAC_SHELL_CMD_CLAIMS` mirrors only shell-bound accelerators, so no desktop-side change is needed.
- Collision check (verify during apply): no existing binding or shell/system claim on `Comma` in any tier (`SHELL_SWITCHER_DIGITS`, `MAC_SHELL_CMD_CLAIMS`, system screenshot claims are all digit/letter keys).
- `ignoreInputs: true` mirrors `shortcuts-overlay`/`compose-toggle` — a chrome-level toggle should fire while an input is focused. Verify the settings dialog's own open state handles a re-fire gracefully (toggle or no-op — follow whatever `shortcuts-overlay` does).

### 4. Wire the handler in BOTH shells

`useKeybindingDispatch` is mounted twice with independent handler maps, and the board route does not render AppShell (known trap — changes inventorying only `app.tsx` miss the board twin):

- `app/frontend/src/app.tsx:2628` area — add `"settings-open": openSettings` to `keybindingHandlers` (`useSettingsDialog` is already consumed at `app.tsx:2128`).
- `app/frontend/src/components/board/board-page.tsx:367` area — add the same entry to `boardKeyHandlers` (board already has its own `settings-open` palette entry at `board-page.tsx:713`, so `openSettings` is reachable there).

The shortcuts overlay and the palette's shortcut column are registry-driven and pick the new binding up automatically; the palette entries keep their existing `id: "settings-open"` so the registry action and palette action share one identity.

### 5. Settings gear Tip gets the chord

`app/frontend/src/components/sidebar/index.tsx` footer — `<Tip label="Settings" placement="top">` gains `kbd={settingsChord}` via the same derivation (the component already consumes `useKeybindings` for `overlayChord`, so this is two lines beside it).

### 6. Tests

- `keybindings.test.ts` (or the existing registry test home): the new default binding exists, resolves ⇧⌘,/⇧Ctrl+, on browsers and ⌘, in the mac shell, and collides with nothing (if a collision-freedom test pattern exists, extend it).
- Component tests (Vitest): Compose Tip and Settings Tip render the chord chip; chip omitted when the binding is disabled (mirror whatever sm6g added for the Keyboard button, if anything — follow that precedent's test depth).
- Grep `app/frontend/tests/` for e2e specs asserting tooltip content or shortcut chips before changing chrome details (known trap: Playwright specs assert chrome details Vitest won't catch); update any affected spec AND its companion `.spec.md` in the same commit (constitution Test Companion Docs).

## Affected Memory

- `run-kit/ui-patterns`: (modify) keybinding registry section — new `settings-open` builtin (chord, macShellOnly promotion); tooltip section — registry-resolved `kbd` chips are the norm for bound actions (supersedes the "static string per call site" note).

## Impact

- `app/frontend/src/lib/keybindings.ts` — one new `DEFAULT_BINDINGS` entry.
- `app/frontend/src/components/bottom-bar.tsx` — two Tip call sites + hook consumption.
- `app/frontend/src/components/sidebar/index.tsx` — one Tip call site.
- `app/frontend/src/app.tsx` + `app/frontend/src/components/board/board-page.tsx` — one handler-map entry each.
- `app/frontend/src/components/tip.tsx` — comment update only.
- No backend, no desktop-shell changes.

## Open Questions

- None blocking. The chord choice (⇧⌘, with mac-shell ⌘, promotion) is Confident, not user-confirmed — flag via `/fab-clarify` if the user prefers a different key.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Compose/palette/Settings Tips resolve chords via `useKeybindings` + `formatCombo`, omitted when disabled | The sm6g precedent in the same footer defines the pattern verbatim; static strings lie under rebinds | S:85 R:90 A:95 D:90 |
| 2 | Confident | Add a `settings-open` binding at `Comma`: shifted tier in browsers, `macTier: cmd` + `macShellOnly` → ⌘, in the mac shell | User expects Settings to have a shortcut; ⌘, is the OS convention and browser-reserved outside the shell; mirrors the create-session precedent. Chord itself not explicitly user-confirmed | S:55 R:85 A:70 D:60 |
| 3 | Certain | Handler wired in both `app.tsx` and `board-page.tsx` dispatch maps | Board route renders no AppShell (recorded trap); both maps already carry `compose-toggle` | S:80 R:90 A:95 D:95 |
| 4 | Confident | `ignoreInputs: true` on the new binding | Mirrors `shortcuts-overlay`/`compose-toggle`, the other chrome-level toggles | S:50 R:90 A:80 D:70 |

4 assumptions (2 certain, 2 confident, 0 tentative, 0 unresolved).
