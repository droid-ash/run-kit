import { formatDuration, parseFabChange } from "@/lib/format";
import { PR_STATE_COLORS, PR_CHECKS_COLORS, PR_REVIEW_COLORS } from "@/components/pr-status-model";
import type { WindowInfo } from "@/types";

/**
 * Shared register-line resolvers for the status pyramid's four orthogonal
 * signal registers (`out` L0 / `agt` L1 / `fab` L2 / `PR` L3 — see
 * docs/specs/status-pyramid.md § Row Minimalism). Extracted from
 * `status-panel.tsx` (93dy) so the TWO register surfaces — the bottom PANE
 * panel's `WindowContent` and the sidebar row-hover flyout card
 * (`row-flyout-card.tsx`) — render from ONE source and cannot drift. Pure
 * functions over the streamed `WindowInfo`; no React.
 */

export type OutputParts = { command: string; active: boolean; idleDuration?: string };

/** Structured form of the L0 `out` register — the card composes its own
 *  layout from these. */
export function getOutputParts(win: WindowInfo, nowSeconds: number): OutputParts {
  const command = win.panes?.find((p) => p.isActive)?.command ?? win.paneCommand ?? "";
  if (win.activity === "active") return { command, active: true };

  let idleDuration: string | undefined;
  if (win.activityTimestamp) {
    const elapsed = nowSeconds - win.activityTimestamp;
    if (elapsed > 0) idleDuration = formatDuration(elapsed);
  }
  return { command, active: false, idleDuration };
}

/**
 * Build the L0 `out` register string. L0 speaks about bytes, not intent:
 * `active · <command>` while output flows, else `<command> — idle Xm since
 * last output` (or `idle Xm` with no command). This register ALWAYS shows its
 * own elapsed value — the duration-mute rule (which hides elapsed when output
 * flows) applied only to the retired one-line tip summary, never here in the
 * uncontested register view, so the waiting-pierce rule is automatic (see spec
 * § Duration-Text Ladder).
 */
export function getOutputLine(win: WindowInfo, nowSeconds: number): string {
  const { command, active, idleDuration } = getOutputParts(win, nowSeconds);
  if (active) return command ? `active · ${command}` : "active";

  const idleText = idleDuration ? `idle ${idleDuration} since last output` : "";
  if (command && idleText) return `${command} — ${idleText}`;
  if (idleText) return idleText;
  return command || "idle";
}

export type AgentParts = { state: string; idleDuration?: string };

/** Structured form of the L1 `agt` register. Null when no `agentState`. */
export function getAgentParts(win: WindowInfo): AgentParts | null {
  if (!win.agentState) return null;
  return { state: win.agentState, idleDuration: win.agentIdleDuration || undefined };
}

/** Build the L1 `agt` register string when an agent is present: e.g.
 *  `waiting 3m` / `active` / `idle 12m`. Null when no `agentState`. */
export function getAgentLine(win: WindowInfo): string | null {
  const parts = getAgentParts(win);
  if (!parts) return null;
  if (parts.idleDuration) return `${parts.state} ${parts.idleDuration}`;
  return parts.state;
}

export type FabParts = { id: string; slug: string; stage: string; displayState?: string };

/** Structured form of the L2 `fab` register. Null when the window has no
 *  parseable fab change or no stage. */
export function getFabParts(win: WindowInfo): FabParts | null {
  const fabChange = parseFabChange(win.fabChange ?? "");
  if (!fabChange || !win.fabStage) return null;
  return {
    id: fabChange.id,
    slug: fabChange.slug,
    stage: win.fabStage,
    displayState: win.fabDisplayState || undefined,
  };
}

/** Build the L2 `fab` register string: `<id> <slug> · <stage>[ ·
 *  <displayState>]`. The displayState segment is appended when present
 *  (`fab pane map` may omit it on older binaries). Null when the window has no
 *  parseable fab change or no stage. */
export function getFabLine(win: WindowInfo): string | null {
  const parts = getFabParts(win);
  if (!parts) return null;
  return `${parts.id} ${parts.slug} · ${parts.stage}${
    parts.displayState ? ` · ${parts.displayState}` : ""
  }`;
}

export type PrSegment = { text: string; color: string };

export type PrParts = { identity: PrSegment[]; health: PrSegment[] };

/** Structured form of the L3 `PR` register: the identity segments (number,
 *  state) split from the health segments (checks, review), so the card can lay
 *  the two groups out on separate lines. Same gating and suppression rules as
 *  the joined form below. */
export function getPrParts(win: WindowInfo): PrParts | null {
  if (!win.prNumber) return null;
  const identity: PrSegment[] = [{ text: `#${win.prNumber}`, color: "text-text-primary" }];
  if (win.prState) {
    identity.push({
      text: `${win.prState}${win.prIsDraft ? " (draft)" : ""}`,
      color: PR_STATE_COLORS[win.prState],
    });
  }
  const health: PrSegment[] = [];
  const isOpen = !win.prState || win.prState === "open";
  if (isOpen && win.prChecks && win.prChecks !== "none") {
    health.push({ text: `checks ${win.prChecks}`, color: PR_CHECKS_COLORS[win.prChecks] });
  }
  if (isOpen && win.prReview && win.prReview !== "none") {
    health.push({
      text: `review: ${win.prReview.replace(/_/g, " ")}`,
      color: PR_REVIEW_COLORS[win.prReview],
    });
  }
  return { identity, health };
}

/**
 * Build the L3 `PR` register line as colored segments, e.g.
 * "#241 · open · checks pass" for an open PR, or "#241 · merged" once it
 * lands. Returns null unless the window carries a `prNumber`. Gated ONLY on
 * `prNumber` — NOT on `fabChange` — because the L3 register shows the PR for
 * ANY pane on a branch with a PR (derivation is universal, Constitution
 * Principle X; the ladder's per-family dot ownership is a separate concern —
 * see statusDotState). For a merged/closed PR the checks and review parts are
 * suppressed (they're historical once the PR is no longer open); only the
 * terminal state is shown. The state segment color is purely the GitHub state
 * (open→green via PR_STATE_COLORS), NOT a health verdict — health is conveyed
 * by the checks and review segments here plus the sidebar dot. A draft is not
 * dimmed: its state follows PR_STATE_COLORS like any open PR, so an open draft
 * shows green. This reflects the project's "green = health, not
 * merge-readiness" story (a draft with passing checks is healthy, just not
 * flipped to ready) and keeps the PR surfaces consistent.
 */
export function getPrSegments(win: WindowInfo): PrSegment[] | null {
  const parts = getPrParts(win);
  if (!parts) return null;
  return [...parts.identity, ...parts.health];
}
