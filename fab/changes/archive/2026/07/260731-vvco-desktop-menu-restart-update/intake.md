# Intake: Desktop Shell "Restart to Update" Menu Item

**Change**: 260731-vvco-desktop-menu-restart-update
**Created**: 2026-07-31

## Origin

Drafted via `/fab-draft` from the update/install UX design conversation (2026-07-30/31), where the user asked: "It also makes sense to have a 'Restart to update' option in the Menu options also right?" and the agreed answer was yes — the menu item is the natural surface and absorbs the previously-separate "in-app staleness nudge" idea.

**Dependency**: this change consumes the CLI contract established by sibling change `260731-3byh-umbrella-update-auto-restart` (Change A) — specifically that `rk desktop update` handles a running app by staging, quitting the app, swapping, and relaunching. **Execute this change only after Change A has merged.**

## Why

1. **Pain point**: a user who lives inside the desktop app (typically viewing remote servers) has no signal that their local app is stale and no in-app way to trigger an update — they must remember to run `rk update`/`rk desktop update` in a local terminal.
2. **Consequence if unfixed**: the shell (deliberately auto-updater-free) quietly falls behind; the update UX built in Change A is only reachable by users who think to run a CLI command.
3. **Why this approach**: an "Update available — Restart to Update" menu item that appears when a newer release is detected, and on click spawns `rk desktop update` **detached** and lets the CLI drive the whole stage → quit → swap → relaunch flow. The app never touches its own bundle and gains no updater logic — it delegates to the updater that already exists. By click time the CLI may even find the download already staged from a prior run. This is the VSCode UX with the CLI as the ShipIt helper.

## What Changes

### 1. Update-available detection (`src/main.ts` + a new pure module)

- Detection runs `rk desktop status` via the existing execFile plumbing from the local-daemon work (#478: candidate-path binary resolution incl. the macOS GUI PATH trap, argument slices, timeouts) and parses its stdout. Per the toolkit output contract, `rk desktop status` stdout is data (stable lines: `Installed: vX`, `Latest: vY`, `Update available — run 'rk desktop update'.` / `Up to date.`) — parse the `Installed:`/`Latest:` pair and the `Update available` marker line.
- Parsing lands in an electron-free pure module (e.g. `src/update-check.ts`, the `servers.ts`/`local-daemon.ts` precedent) with a sibling `node --test` suite; three-dep pin preserved.
- **Cadence**: check on startup and on window focus, throttled to at most once per hour (the `rk desktop status` call hits the GitHub releases API — unauthenticated rate limits apply). Cache the last result main-side (the #478 menu-cache pattern: no perpetual timer; refresh at natural events).
- **Platform/presence gating**: darwin only (`rk desktop` is macOS-only), and only when the rk binary resolves. Absent rk, non-darwin, status failure, or up-to-date → no menu item at all (silent).

### 2. Menu item (`src/menu.ts` + `src/main.ts`)

- A single **accelerator-less** item labeled `Restart to Update (vX.Y.Z available)…` — placed in the macOS App menu, below the About/services region and above Quit (app-level concern, not a Servers concern; exact slot per existing menu structure). Rendered only when the cached detection says an update is available. The keyboard-tier seam is untouched (no accelerator ⇒ no registry mirror change).
- `buildMenu` gains the cached update info the same way it gained the daemon param in #478 (extend the existing extra-info parameter shape; menu rebuilt on detection-state change via the existing rebuild seam).
- **Click behavior**: spawn `rk desktop update` fully detached — `child_process.spawn` with `detached: true`, stdio ignored, `.unref()` — so the child survives the app being quit by the CLI moments later. Then retitle/disable the item (`Updating…`) until the quit arrives; no dialog (the CLI announces the restart on its own data channel, and the app will visibly relaunch). No IPC/preload surface is added — the menu is main-side only.
- Failure mode: if the spawn itself fails (binary vanished), show the existing native-dialog error pattern; anything after a successful spawn is the CLI's responsibility.

### 3. child_process posture note

#478 amended the shell's recorded posture to "child_process only for explicit user-initiated `rk daemon` actions + read-only detection". This change extends the *user-initiated* clause with `rk desktop update` (menu click) and the *read-only detection* clause with `rk desktop status` — still no auto-start, still a viewer. Memory § posture line updated at hydrate.

### Rejected alternatives (from the design conversation)

- **SPA-side staleness nudge** (bridge version + backend update-checker banner): the menu item supersedes it — same discovery value, no SPA/bridge surface, and it carries the action, not just the news.
- **In-app updater** (electron-updater/Squirrel): recorded non-goal; the CLI is the updater.
- **The app quitting itself after spawning**: unnecessary — Change A's CLI performs the graceful quit itself (AppleScript), which also lets the shell's `close` handler capture `lastPath` for the relaunch restore.

### Out of scope

Change A itself (umbrella `rk update` + installer auto-restart — sibling `260731-3byh`); any Windows/Linux update surface; launchd autostart; SPA/bridge changes (none needed — no preload or IPC additions).

## Affected Memory

- `run-kit/desktop-shell`: (modify) menu section gains the Restart-to-Update item (darwin-only, detection-gated, accelerator-less); child_process posture line extended (`rk desktop update` user-initiated + `rk desktop status` read-only detection); new `update-check.ts` pure module in the package shape.

## Impact

- `app/desktop/src/update-check.ts` (new) + `update-check.test.ts` (new) — status-output parsing + availability derivation, node:test covered.
- `app/desktop/src/main.ts` — detection cache (startup/focus, 1h throttle), detached spawn on click, menu rebuild wiring.
- `app/desktop/src/menu.ts` — conditional App-menu item, extended info param.
- No Go changes; `rk desktop status`/`update` consumed as-is (contract from Change A).
- Tests: `pnpm run compile` + `node --test` in app/desktop; Playwright does not cover the shell.

## Open Questions

- None — decisions were resolved in the design conversation; remaining choices are graded below.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Menu item spawns `rk desktop update` detached (spawn + detached:true + unref, stdio ignored) and the CLI drives quit/swap/relaunch; the app adds no updater logic | Discussed — the agreed mechanism; detachment is what survives the CLI quitting the parent | S:90 R:85 A:90 D:90 |
| 2 | Certain | Item is accelerator-less, darwin-only, and rendered only when detection says an update is available | Discussed (menu-tier seam untouched; rk desktop is macOS-only; absence states are silent) | S:90 R:90 A:90 D:90 |
| 3 | Confident | Detection = parse `rk desktop status` stdout (`Installed:`/`Latest:`/`Update available` marker) in a pure electron-free module with node:test | Toolkit contract makes status stdout stable data; package precedent (servers.ts/local-daemon.ts); if parsing proves brittle a `--json` flag on status is the follow-up, not in this change | S:65 R:80 A:80 D:70 |
| 4 | Confident | Check cadence: startup + window-focus, throttled to ≤1/hour, cached main-side; no perpetual timer | #478 menu-cache precedent; GitHub API rate limits argue for the throttle; "every few seconds" polling is a welcome-page pattern, not a menu one | S:60 R:90 A:85 D:70 |
| 5 | Confident | Placement: macOS App menu near Quit; label `Restart to Update (vX.Y.Z available)…`; after click retitle/disable to `Updating…`, no dialog | App-level concern → App menu; exact copy is cosmetic and easily changed; CLI announces the restart itself | S:55 R:90 A:80 D:65 |
| 6 | Confident | Execution ordering: this change starts only after Change A (260731-3byh) merges; its acceptance assumes the running-app-capable `rk desktop update` | Discussed — series-then-parallel plan; the CLI contract is pinned in Change A's intake | S:85 R:75 A:85 D:85 |
| 7 | Confident | Spawn failure surfaces via the existing native-dialog error pattern; post-spawn outcomes are the CLI's responsibility (no monitoring) | Matches #478 error idiom; monitoring a detached child contradicts the delegation design | S:60 R:85 A:85 D:75 |

7 assumptions (2 certain, 5 confident, 0 tentative, 0 unresolved).
