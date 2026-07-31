# Intake: Umbrella `rk update` with Desktop Auto-Restart

**Change**: 260731-3byh-umbrella-update-auto-restart
**Created**: 2026-07-31

## Origin

Drafted via `/fab-draft` from an extended design conversation (2026-07-30) about the update/install UX. The conversation produced explicit decisions for two pieces the user asked to combine into one change ("Change A"): (1) the desktop installer's auto-restart update flow (the VSCode pattern), and (2) the umbrella `rk update` command that updates both the CLI and the desktop app based on whichever is installed.

> rk update should update both the rk server and the rk desktop app (on the basis of whichever is installed) … Do running apps not update? Eg: Whenever VSCode updates - it does something in the background then just asks me to restart the app … Agreed - lets start with autorestart for now.

A sibling draft (`260731-vvco-desktop-menu-restart-update`, "Change B") adds a shell menu item that consumes this change's CLI contract; it executes AFTER this change.

## Why

1. **Pain point**: `rk update` only updates the Homebrew CLI + daemon; the desktop app must be updated separately via `rk desktop update`, which **hard-refuses while the app is running** (`errDesktopAppRunning`, gate fires before the download). Since the most common place to run `rk update` is a terminal *inside* the desktop app, the app-refusal makes a combined update impossible in exactly the common case, and users end up with a stale viewer shell.
2. **Consequence if unfixed**: two update commands to remember, and the desktop leg of any combined flow would skip nearly every time. The app has no auto-updater by design (electron-updater is a recorded non-goal), so the CLI is the only updater — it must handle a running app.
3. **Why this approach**: the current installer already builds the second half of the VSCode pattern (stage-then-atomic-swap, `internal/desktop/install.go` — staged next to target, same-volume rename). The missing half is relocating the app-running gate from "refuse before download" to "refuse only the swap until the app quits", plus quit/relaunch orchestration. The rk CLI process runs under tmux, fully independent of the app (Constitution VI), so unlike most apps no separate helper process is needed — the CLI *is* the ShipIt helper. Restart is genuinely low-cost: the app is a passive viewer with no state to lose, and the shell captures `lastPath` on its `close` event, so relaunch restores the exact route.

## What Changes

### 1. Installer: stage/swap split + quit-swap-relaunch (`internal/desktop/install.go` + new helpers)

Restructure `Install` so the app-running refusal moves to the swap boundary:

- **Stage phase (runs while the app is running)**: resolve release → download DMG → SHA256 vs release digest (when supplied) → mount → `codesign --verify --deep --strict` → `ditto` to the deterministic dot-prefixed staging path inside `InstallDir`. All existing verification gates unchanged and un-skippable.
- **Swap phase**: if the app is NOT running — exactly today's behavior (remove old bundle, rename staged into place). If the app IS running — **auto-restart** (the agreed default; no suppress flag in v1):
  1. Gracefully quit: `osascript -e 'tell application "Run Kit" to quit'` (argument-slice exec with timeout, per Constitution I / § Process Execution). Graceful quit matters: Electron gets its shutdown hooks, and the shell's `close` handler captures `lastPath` so relaunch restores the user's route.
  2. Wait for process exit (poll the existing `AppRunning` probe, ~1s cadence, bounded — see Assumptions) — the TOCTOU re-check before the swap remains.
  3. Rename swap (existing atomic path).
  4. Relaunch: `open -a <installed app path>` (argument slice, timeout).
- **Quit-timeout failure path**: if the app has not exited within the bound, abort without swapping, remove nothing that exists today (the deterministic staging name self-heals on the next run), and return an error telling the user to quit the app manually.
- The current pre-download `AppRunning` refusal and `errDesktopAppRunning` are **removed** from install/update flows (the running state is now handled, not refused). `--force` semantics keep their scope: version-state only.
- `rk desktop install` gets the same relocated gate + auto-restart behavior as `update` (both route through `ins.Install`; divergent behavior would be surprising).

Output contract (Toolkit Principle 9): progress lines (staging, quitting, relaunching) are chatter (stderr, dropped by `--quiet`); the outcome lines — `Updated Run Kit vX -> vY (path)` and a new restart announcement data line (e.g. `Run Kit was running — restarted on the new version.`) — are data (stdout, survive `--quiet`).

### 2. Umbrella `rk update` (`cmd/rk/upgrade.go`)

`rk update` becomes two **independent, fail-independent legs**, each gated on its own install detection:

- **CLI leg (first — "update the tool, then its artifacts")**: unchanged brew flow — `selfpath.IsBrewInstalled` → `brew update` (skippable via existing `--skip-brew-update`) → `brew info` → `brew upgrade` → daemon restart, with all existing brew-mutation bounds (SIGTERM + grace, generous timeouts) preserved. **Behavior change**: a non-brew install prints the existing manual-update guidance (data) but **no longer early-returns the whole command** — execution continues to the desktop leg.
- **Desktop leg (darwin only, default `/Applications` path only)**: `InstalledVersion()` — empty → **silently skip** (no app, nothing to do; unlike standalone `rk desktop update`, which keeps its "not installed — run rk desktop install first" error). Installed → resolve latest, compare via existing `updatecheck.AnyIncrease`; stale → run the piece-1 install flow (auto-restart included); current → `Already up to date` data line mirroring the CLI leg's shape.
- **Exit code**: non-zero if either leg genuinely *fails*; all skips (not brew-installed, non-darwin, no desktop app) are exit-0 data lines. A CLI-leg failure does not prevent the desktop leg from running (and vice versa); on any leg failure the command reports both legs' outcomes and exits non-zero.
- **Custom `--path` installs are invisible to the umbrella** (accepted + documented in help text): there is no state store to remember an install path (Constitution II); `~/Applications` users keep using `rk desktop update --path`.
- Non-darwin platforms: desktop leg no-ops silently; `rk update` behaves exactly as today.

### 3. Toolkit-standards conformance (Constitution § Toolkit Standards)

The `rk update` surface is bound to the shll `update` standard (currently PASS per `docs/memory/run-kit/toolkit-standards.md`). This change MUST:
- Re-audit the new umbrella semantics against `shll standards update` (brew-handling safety clause already honored — bounds unchanged).
- Re-check help-dump stability (`rk help-dump` golden) — `update`'s and `desktop install/update`'s help text change; the command *tree* does not.
- Keep the Principle 9 stdout/stderr + `--quiet` contract described above.

### Rejected alternatives (from the design conversation)

- **Swapping the bundle under the running app**: modifying a running app's bundle can invalidate its code signature and macOS kills the process (hardened-runtime enforcement) — the reason the original refusal was sound. Stage-while-running + swap-in-the-quit-gap is the correct pattern (what Squirrel.Mac/VSCode actually do).
- **In-app electron-updater/Squirrel**: needs an update feed, re-opens the quarantine/signing surface the CLI installer was built to avoid, duplicates an existing updater. Remains a recorded non-goal.
- **Warn-and-skip when the app is running** (the pre-auto-restart interim design): superseded by the user's explicit "lets start with autorestart for now".
- **A `--no-restart` suppress flag**: deferred — minimal surface for v1; the flag is cheap to add later if demos need it.
- **Scanning candidate paths (`~/Applications`) in the umbrella**: rejected — no state store (Constitution II), document the default-path limitation instead.

### Out of scope

The "Restart to Update" shell menu item (sibling draft `260731-vvco`), launchd daemon autostart, installer seeding of servers.json, any Windows/Linux desktop update mechanism (`rk desktop` remains macOS-only).

## Affected Memory

- `run-kit/desktop-shell`: (modify) § Installation & Updates — the update path now stages while running and auto-restarts (quit → swap → relaunch); `errDesktopAppRunning`/pre-download refusal removed; "no auto-updater in the app" claim survives unchanged.
- `run-kit/architecture`: (modify) CLI subcommands — `update` becomes the two-leg umbrella; `desktop install/update` behavior notes.
- `run-kit/toolkit-standards`: (modify) update-standard audit note for the umbrella semantics + help-dump re-check.

## Impact

- `app/backend/internal/desktop/install.go` — stage/swap split, quit/wait/relaunch helpers, gate relocation. New seam vars for osascript/open (mirroring the existing `Run` seam) so flows are unit-testable without macOS tools.
- `app/backend/internal/desktop/*_test.go` — cover: swap-while-not-running unchanged; running → quit-poll-swap-relaunch order; quit-timeout abort (no swap, error); restart announcement on the data channel.
- `app/backend/cmd/rk/upgrade.go` — two-leg umbrella, fail-independence, exit-code aggregation, help text.
- `app/backend/cmd/rk/upgrade_test.go`, `cmd/rk/desktop.go` + `desktop_test.go` — removed refusal, updated long help (no-flag surface change), leg-skip matrix (non-brew + app installed; brew + no app; non-darwin).
- `cmd/rk/help_dump` goldens if help text is embedded there.
- Tests via `just test-backend` (Go only — no frontend/e2e surface).

## Open Questions

- None — the design conversation resolved the material decisions; remaining choices are graded below.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Auto-restart is the default and only behavior when the app is running: stage → graceful quit → swap → relaunch; no suppress flag in v1 | Discussed — user: "lets start with autorestart for now"; flag deferred as rejected-alternative | S:95 R:90 A:90 D:90 |
| 2 | Certain | Stage phase (download + SHA256 + codesign + ditto staging) runs while the app is running; the running-state refusal applies only to the swap, and the TOCTOU re-check stays at the swap boundary | Discussed — the agreed relocation of the gate; verification gates un-skippable as today | S:90 R:85 A:90 D:90 |
| 3 | Certain | Umbrella legs are independent and fail-independent; skips are exit-0 data lines; non-zero exit only on genuine leg failure; CLI leg runs first | Discussed — decisions recorded verbatim in the conversation | S:90 R:85 A:90 D:90 |
| 4 | Certain | Non-brew CLI installs print guidance but continue to the desktop leg (no early return); desktop leg checks default /Applications only; custom --path documented as out of umbrella scope | Discussed — verbatim; Constitution II bars an install-path state store | S:90 R:85 A:90 D:90 |
| 5 | Confident | Graceful quit via `osascript -e 'tell application "Run Kit" to quit'`, then poll `AppRunning` ~1s up to 30s; on timeout abort without swap and instruct manual quit | Discussed mechanism (AppleScript quit for Electron shutdown hooks); the 30s bound mirrors the package's timeout discipline — a hung quit means user interaction is needed | S:70 R:85 A:80 D:75 |
| 6 | Confident | Relaunch via `open -a` on the installed bundle path after the swap; relaunch failure is a non-fatal warning (update succeeded; the user can open the app) | `open -a` is the standard seam; failing the whole update over a relaunch hiccup would misreport a completed swap | S:65 R:85 A:80 D:75 |
| 7 | Confident | `rk desktop install` gets the same relocated gate + auto-restart as `update` (both route through `ins.Install`) | One shared flow; divergent running-app behavior between install and update would be surprising and untestable twice | S:60 R:80 A:85 D:75 |
| 8 | Confident | The restart announcement is a stdout data line; quit/relaunch progress is stderr chatter dropped by `--quiet` | Toolkit Principle 9 posture already established for this command family (outcome = data) | S:70 R:90 A:90 D:80 |
| 9 | Confident | Umbrella desktop leg silently skips when no app is installed, while standalone `rk desktop update` keeps its not-installed error | Umbrella = "whichever is installed" (absence is a valid state); standalone update of nothing stays a user error — both discussed | S:75 R:85 A:85 D:80 |
| 10 | Confident | New exec seams (osascript, open) follow the existing `runBrewFn`/`ins.Run` seam-var idiom with `exec.CommandContext` + argument slices + timeouts | Constitution I + § Process Execution; the package precedent is unambiguous | S:80 R:90 A:95 D:85 |
| 11 | Confident | Help-dump goldens and the shll update-standard audit are in-scope acceptance items; command tree unchanged (no new subcommands, no new flags) | Constitution § Toolkit Standards binds the surface; minimal-surface decision means tree stability | S:70 R:85 A:85 D:80 |

11 assumptions (4 certain, 7 confident, 0 tentative, 0 unresolved).
