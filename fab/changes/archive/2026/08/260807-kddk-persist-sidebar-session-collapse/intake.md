# Intake: Persist Sidebar Session Collapse State

**Change**: 260807-kddk-persist-sidebar-session-collapse
**Created**: 2026-08-07

## Origin

Conversational — carved out of a `/fab-discuss` session covering two sidebar features (this one and a separate multi-select/bulk-move change, pursued independently). The user's raw input:

> I want to maintain the expanded / non expanded state of the sessions across refreshes (can be localstorage based)

Key decisions from the discussion:
- localStorage is the persistence mechanism (explicitly suggested by the user).
- Mirror the existing per-server sections persistence pattern (`runkit-panel-sessions-{server}`) rather than inventing a new one.
- Store only collapsed exceptions so the default (expanded) behavior for new sessions is unchanged.
- Copy the StrictMode-safe write pattern documented in `toggleServerSection` (side effects outside the state updater).

## Why

1. **Pain point**: The sidebar's per-session window-list collapse (`collapsed` state in `app/frontend/src/components/sidebar/index.tsx:261`) is plain React state. Every page refresh, navigation to a fresh tab, or dev-server reload resets all sessions to expanded. Users who collapse noisy sessions (many windows, background servers) must re-collapse them constantly.
2. **Consequence of not fixing**: The sidebar stays cluttered by default and the collapse affordance loses most of its value — a toggle that doesn't survive a refresh trains users to stop using it.
3. **Why this approach**: The per-server *sections* open/closed state is already persisted in localStorage (`runkit-panel-sessions-{server}`, `index.tsx:170-213`), so persisting the per-*session* collapse map is a straight extension of an established, proven pattern in the same file. No backend involvement — this is pure client-side view preference, consistent with Constitution Principle II (no server-side state store for derivable/preference data).

## What Changes

All changes are in `app/frontend/src/components/sidebar/index.tsx` (plus its tests). No backend, no API, no routes.

### Persist the `collapsed` map to localStorage

Current state (for the implementing agent's orientation):

- `const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})` at `index.tsx:261`.
- Keys are `` `${server}:${session.name}` `` (see `sessionRowKey` at `index.tsx:1771`).
- Toggle site: `index.tsx:766` — `setCollapsed((prev) => ({ ...prev, [`${server}:${name}`]: !prev[...] }))`.
- Read sites default to expanded: `collapsed[sessionRowKey] ?? false` (`index.tsx:1775`, `index.tsx:1976`).

New behavior:

1. **Storage key**: a single localStorage key `runkit-session-collapsed` holding a JSON object of collapsed exceptions, e.g. `{"default:utils2": true, "fabKit1:relay-spike": true}`. Only `true` entries are stored — an expanded session has no entry. (One JSON-map key rather than one localStorage key per session: per-session keys would sprawl unboundedly and can't be enumerated for cleanup; the per-server pattern uses scalar keys only because its value is a single boolean per server.)
2. **Hydrate**: seed the `useState` with a lazy initializer that reads and parses the key inside try/catch (malformed JSON or unavailable localStorage → `{}`). Values are normalized to `true`-only entries on read.
3. **Write on toggle**: in the toggle handler, compute the next map and write it to localStorage **outside the state updater**, following the StrictMode purity pattern documented at `index.tsx:226-259` (`toggleServerSection`): under React 19 StrictMode the updater runs twice, and a side effect inside it makes a single click a no-op. Snapshot current → derive next → `localStorage.setItem` once → commit state.
4. **Expanding deletes the entry**: toggling a session back to expanded removes its key from the stored map (keeps the map exceptions-only and lets the default apply if the default ever changes).
5. **Defaults unchanged**: unknown key → expanded (`?? false` stays). New sessions appear expanded exactly as today.
6. **All localStorage access wrapped in try/catch** with silent fallback — the existing convention throughout this file.

### Non-goals

- **No cross-tab sync** (`storage` event listener) — the existing per-server persistence doesn't do it; a refresh picks up the other tab's writes.
- **No stale-entry pruning in v1** — entries are tiny booleans; killed sessions leave orphan keys that are harmless and get overwritten if the name recurs. Pruning would require knowing the full session set across *non-attached* servers, which the client deliberately doesn't have.
- **No persistence of the roving-focus key or scroll position** — collapse state only.

### Tests

Unit tests colocated with the sidebar (extend the existing sidebar test file):

- Toggling a session to collapsed writes the `runkit-session-collapsed` entry; remounting the sidebar restores it collapsed.
- Toggling back to expanded removes the entry from the stored map.
- Malformed JSON in the key → sidebar renders with all sessions expanded (no throw).
- A session with no entry renders expanded (default preserved).

## Affected Memory

- `run-kit/ui-patterns`: (modify) sidebar section — note that per-session collapse is persisted in `runkit-session-collapsed` (single JSON-map key, exceptions-only), alongside the existing per-server `runkit-panel-sessions-{server}` scalar keys.

## Impact

- `app/frontend/src/components/sidebar/index.tsx` — the `collapsed` state seed + toggle handler (two focused edits).
- Sidebar unit tests — a handful of new cases.
- No Go changes, no API changes, no e2e-visible route/layout changes (an e2e for persistence-across-reload is optional; unit coverage of the localStorage contract is sufficient).

## Open Questions

- (none — all decisions resolved in the originating discussion)

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | localStorage as the persistence mechanism | Discussed — user explicitly said "can be localstorage based"; matches the existing per-server pattern in the same file | S:95 R:90 A:95 D:95 |
| 2 | Certain | Store only collapsed exceptions; default stays expanded (`?? false`) | Discussed — preserves today's default for new sessions; exceptions-only keeps the map minimal | S:85 R:90 A:90 D:90 |
| 3 | Confident | Single JSON-map key `runkit-session-collapsed` rather than per-session scalar keys | Per-session keys sprawl and can't be enumerated for cleanup; single-map is the obvious shape for a keyed boolean set; trivially reversible | S:65 R:90 A:85 D:75 |
| 4 | Certain | Side effects outside the state updater (StrictMode purity) | Pattern documented in-code at `toggleServerSection` (index.tsx:226-259) with the exact failure mode explained | S:80 R:85 A:100 D:95 |
| 5 | Confident | No stale-entry pruning, no cross-tab sync in v1 | Entries are tiny; pruning needs cross-server session knowledge the client lacks; existing per-server persistence sets the precedent for no `storage`-event sync | S:60 R:95 A:85 D:70 |

5 assumptions (3 certain, 2 confident, 0 tentative, 0 unresolved).
