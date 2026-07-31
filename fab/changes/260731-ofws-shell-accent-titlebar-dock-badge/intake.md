# Intake: Desktop Shell Accent Titlebar & Waiting Badge

**Change**: 260731-ofws-shell-accent-titlebar-dock-badge
**Created**: 2026-07-31

## Origin

Conversational — a `/fab-discuss` ideation session on making the Electron desktop shell visually distinct from the PWA, driven by an HTML mock page reviewed in a run-kit iframe window.

> So just for 1b) and 3) can you create an intake.

Where the reviewed mock's numbered treatments were: **1** full titlebar merge (SPA top bar becomes the window chrome), **1b** accent-colored titlebar strip (no merge), **2** sidebar vibrancy, **3** dock/taskbar waiting badge, **4** launch-flash sync + shell marker chip. Key decisions from the conversation:

- User chose the **colored titlebar strip (1b) over the full merge (1)** — "Instead of merging with title bar, what if just color the title bar - like the PWA title bar gets colored with the server color". The merge remains a possible later step on the same hidden-titlebar foundation, but is out of scope here.
- For OS-level status signals the user accepted **"Dock/taskbar badge only for now"** — taskbar progress bar and per-route window title were presented alongside and not taken.
- Vibrancy (2) and the free wins (4 — `backgroundColor` theme sync, shell marker chip) are **excluded** from this change.

## Why

1. **The shell looks like "the PWA in a picture frame."** `app/desktop` opens a stock `BrowserWindow` (default OS titlebar, hardcoded `backgroundColor: "#0f1117"` at `main.ts:599`) loading the same SPA a browser shows. Nothing about the window says "app" or says *which rk host this is*.
2. **The PWA already has the exact concept the shell lacks.** The instance accent ("host color", stored per-host in `~/.rk/settings.yaml` `instance_color`) is blended into the `theme-color` meta at `INSTANCE_TITLEBAR_RATIO = 0.35` by `app/frontend/src/instance-accent.ts` — which is what tints an *installed PWA's* titlebar today. The desktop shell — the most native surface run-kit has — ignores it. This change is parity, not invention.
3. **Waiting agents are invisible when the window isn't focused.** The whole point of an agent-orchestration dashboard is "something needs you"; today that signal exists only inside the page (sidebar waiting badges, per the status pyramid's attention tier). An OS badge surfaces it on the dock/taskbar, which a background browser tab physically cannot do.
4. If we skip it: the desktop shell ships as a strictly-worse browser (no URL bar, same look), giving users little reason to install it, and multi-host operators keep mis-typing into the wrong window.

## What Changes

### 1. Accent-colored titlebar strip

**Shell (`app/desktop/src/main.ts`)** — hide the native titlebar so the page's top edge becomes the visible "titlebar":

- macOS: `titleBarStyle: "hiddenInset"` (traffic lights composite over the page-drawn strip).
- Windows/Linux: `titleBarStyle: "hidden"` + `titleBarOverlay: { color, symbolColor, height }` so native `─ ▢ ✕` draw over the strip's right end.
- Listen to `webContents.on("did-change-theme-color")` — fired by the **same `theme-color` meta the SPA already maintains** (including the pre-paint localStorage echo in `index.html`) — and on Windows/Linux call `win.setTitleBarOverlay({ color: <observed>, symbolColor: <contrast-derived> })`. No new SPA→shell API is needed for the color itself.
- **Version-skew fallback**: an older SPA (no strip) under the new shell would leave the window with no drag surface. On `did-finish-load`, if the loaded page is a registered host origin, the shell `insertCSS`es a minimal fallback strip (fixed-position band, `padding-top` on `body`, background from the last observed theme-color, `-webkit-app-region: drag`). The SPA-drawn strip (below) carries a marker the injected CSS keys off to no-op when the real strip exists (e.g. `html.rk-shell-strip` set by the SPA).
- `welcome.html` gets its own static strip (neutral `#0f1117` band, draggable) so the welcome page is draggable and visually consistent.

**SPA (`app/frontend/src/`)** — a new strip component rendered only when `isShell()` (the existing seam in `src/lib/shell.ts`):

- ~28px full-width band above the existing top bar. The top bar itself is **byte-identical to today** — no layout, breadcrumb, or hamburger changes (this is the explicit contrast with the rejected merge option).
- Background: the instance accent blended at the existing `INSTANCE_TITLEBAR_RATIO` (0.35) via the existing `instance-accent.ts` helpers — identical color math to the PWA titlebar tint. No accent set → the plain theme background (today's meta content), still draggable.
- Entire strip is `-webkit-app-region: drag`; **nothing interactive lives on it** (no `no-drag` bookkeeping).
- Centered label: the shell-registered active host name via the existing `runkitShell.servers.list()` bridge call, falling back to `location.hostname` when the call fails or the entry is missing. Text color contrast-derived from the strip background (reuse `themes.ts` contrast helpers).
- Left/right insets so the label never sits under the macOS traffic lights or the Windows overlay controls (`titlebar-area-*` env vars on Windows; a fixed ~80px inset on darwin, from `shellInfo().platform`).
- Strip persists in macOS fullscreen in v1 (traffic lights auto-hide over it; no fullscreen bridge flag is added).

### 2. Dock/taskbar waiting badge

**Bridge (`app/desktop/src/preload.ts`)** — new invoker group on `runkitShell`:

```ts
badge: {
  set: (count: number): Promise<unknown> => ipcRenderer.invoke("badge:set", count),
},
```

**Shell (`app/desktop/src/main.ts`)** — `badge:set` handler:

- Sender-gated exactly like `servers:*` (registered host origins + welcome page); non-integer or negative payloads rejected.
- macOS/Linux: `app.setBadgeCount(n)` (`0` clears).
- Windows: `win.setOverlayIcon(<generated count NativeImage>, "N agents waiting")`, `null` at 0. The count-glyph rendering (canvas-free, e.g. `nativeImage.createFromDataURL` of a small generated SVG/PNG) lives in an electron-free pure module (`badge.ts`) with `node --test` coverage, following the `hosts.ts`/`local-daemon.ts` precedent.
- Badge cleared on host switch and on navigation to the welcome page (the new page re-reports once its SSE stream is up); cleared on window close.

**SPA** — a small subscriber that derives **the waiting-agent count** from the already-streamed SSE session state (the agent-state `waiting` lifecycle — the status pyramid's attention tier) and calls `runkitShell.badge.set(n)` when the count changes (gated on `isShell()`, no-op in browsers):

- Waiting only — busy/idle never count, so a non-zero badge always means "act now".
- Scope is the connected host instance (everything its SSE stream covers); other registered hosts' agents are not counted — the badge describes the window's host, matching the titlebar strip's identity claim.
- Idempotent + debounced (report on change only), and reports `0` explicitly so clears propagate.

### Testing

- Shell: pure-module coverage under `node --test` (badge glyph/count formatting, fallback-CSS gating predicate), matching the existing electron-free module pattern.
- Frontend: Vitest units for the strip's `isShell()`/accent/fallback-label logic and the waiting-count derivation + debounce. Existing browser e2e is unaffected (`isShell()` is false in Playwright).

## Affected Memory

- `run-kit/desktop-shell.md`: (modify) hidden-titlebar + strip architecture, `did-change-theme-color` seam, `badge:set` IPC contract and sender gating, version-skew fallback
- `run-kit/ui-patterns.md`: (modify) instance accent gains a third consumer (PWA titlebar meta → top-bar wash → shell titlebar strip); strip drag-region convention

## Impact

- `app/desktop/src/main.ts` — BrowserWindow options, theme-color listener, `badge:set` handler, fallback `insertCSS`, welcome strip
- `app/desktop/src/preload.ts` — `badge` invoker group
- `app/desktop/src/badge.ts` (+ test) — new pure module
- `app/desktop/src/welcome/welcome.html` — static strip
- `app/frontend/src/` — new strip component (+ test), mount in the shell layout, waiting-count badge subscriber (+ test); `lib/shell.ts` gains the `badge` bridge accessor
- No backend (Go) changes; no route changes (Constitution IV untouched); new IPC follows the existing sender-gating posture (Constitution I)

## Open Questions

- None — the design was resolved in the mock-review conversation.

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Scope = colored strip (1b) + dock/taskbar badge (3) only; merge, vibrancy, launch-flash sync, shell chip all excluded | Discussed — user picked 1b over 1 and "badge only for now" explicitly | S:95 R:90 A:95 D:95 |
| 2 | Certain | Strip color = instance accent at existing `INSTANCE_TITLEBAR_RATIO` (0.35) reusing `instance-accent.ts` helpers | User framed the feature as "like the PWA title bar" — that mechanism IS the PWA titlebar tint | S:90 R:85 A:95 D:90 |
| 3 | Certain | New `badge:set` IPC sender-gated like `servers:*` (registered host origins + welcome) | Constitution I + the shell's uniform existing gating posture | S:85 R:80 A:95 D:90 |
| 4 | Confident | Badge counts **waiting** agents only (attention tier); busy/idle never badge; clears at 0 | Proposed in the reviewed mock caption; user approved the badge without objection | S:70 R:85 A:80 D:75 |
| 5 | Confident | Strip is SPA-drawn (`isShell()`-gated) with shell `insertCSS` fallback for older SPAs; Windows overlay color synced via `did-change-theme-color` | Mock-review conversation settled this split; reuses the existing meta seam with zero new color API | S:65 R:70 A:80 D:70 |
| 6 | Confident | `hiddenInset` (macOS) / `hidden` + `titleBarOverlay` (Windows & Linux, Linux degrading gracefully where WCO support is partial) | Only Electron mechanism for a colored titlebar — native caption tinting is not exposed on either platform | S:65 R:75 A:85 D:80 |
| 7 | Confident | Strip label = shell-registered active host name (existing `servers.list` bridge), fallback `location.hostname`; height ~28px | Mock showed the host name centered; trivially reversible presentation choice with a clear front-runner | S:50 R:85 A:60 D:45 |
| 8 | Confident | Badge scope = the connected host instance only; cleared on host switch until the new page re-reports | The SPA only knows its own instance's SSE state; matches the strip's per-window identity claim | S:55 R:80 A:75 D:70 |
| 9 | Confident | Strip persists in macOS fullscreen in v1 (no fullscreen bridge flag) | Avoids a new bridge surface; reversible later if the dead band annoys | S:40 R:85 A:60 D:50 |

9 assumptions (3 certain, 6 confident, 0 tentative, 0 unresolved).
