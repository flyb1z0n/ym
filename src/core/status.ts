import type { HookEvent, Session, Status, WindowInfo } from "./types.ts";

export const STALE_MS = 10 * 60 * 1000;

const WORKING_EVENTS = new Set([
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "afterFileEdit",
  "subagentStart",
  "subagentStop",
]);

const OK_STOP = new Set(["completed", "aborted"]);

export type BaseStatus = "working" | "your_turn" | "error" | "exited" | "none";

export interface SessionState {
  base: BaseStatus;
  lastEventAt: number;
}

export const initialState = (): SessionState => ({ base: "none", lastEventAt: 0 });

export function applyEvent(state: SessionState, ev: HookEvent): SessionState {
  const at = Math.max(state.lastEventAt, ev.ts);
  if (ev.event === "ymLaunch") return { base: ev.withPrompt ? "working" : "your_turn", lastEventAt: at };
  if (ev.event === "stop") {
    return { base: OK_STOP.has(ev.stopStatus ?? "completed") ? "your_turn" : "error", lastEventAt: at };
  }
  if (ev.event === "sessionEnd") return { base: "exited", lastEventAt: at };
  if (WORKING_EVENTS.has(ev.event)) return { base: "working", lastEventAt: at };
  return { ...state, lastEventAt: at };
}

export function applyEvents(state: SessionState, events: HookEvent[]): SessionState {
  return events.reduce(applyEvent, state);
}

export function deriveStatus(
  session: Pick<Session, "source">,
  state: SessionState,
  window: WindowInfo | undefined,
  now: number,
): Status {
  if (state.base === "none") {
    if (session.source === "import") return "imported";
    return isAlive(window) ? "working" : "exited";
  }
  if (!window || window.dead || state.base === "exited") return "exited";
  if (state.base === "working" && now - state.lastEventAt > STALE_MS) return "stale";
  return state.base;
}

export const isAlive = (w: WindowInfo | undefined) => !!w && !w.dead;
