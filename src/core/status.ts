import type { HookEvent, Session, Status, PaneInfo } from "./types.ts";

export const STALE_MS = 10 * 60 * 1000;
/** A session still without a chat after this long lost its starter (e.g. the dashboard restarted). */
export const START_TIMEOUT_MS = 2 * 60 * 1000;

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
/** Interrupting a turn makes Cursor emit stop "aborted" and then, within milliseconds, stop "error". */
const ABORT_ECHO_MS = 2000;

export type BaseStatus = "working" | "your_turn" | "error" | "exited" | "none";

export interface SessionState {
  base: BaseStatus;
  lastEventAt: number;
  abortedAt?: number;
}

export const initialState = (): SessionState => ({ base: "none", lastEventAt: 0 });

export function applyEvent(state: SessionState, ev: HookEvent): SessionState {
  const at = Math.max(state.lastEventAt, ev.ts);
  if (ev.event === "ymLaunch") return { base: ev.withPrompt ? "working" : "your_turn", lastEventAt: at };
  if (ev.event === "stop") {
    const status = ev.stopStatus ?? "completed";
    if (status === "aborted") return { base: "your_turn", lastEventAt: at, abortedAt: ev.ts };
    if (OK_STOP.has(status)) return { base: "your_turn", lastEventAt: at };
    if (state.abortedAt !== undefined && ev.ts - state.abortedAt < ABORT_ECHO_MS) return { ...state, lastEventAt: at };
    return { base: "error", lastEventAt: at };
  }
  if (ev.event === "sessionEnd") return { base: "exited", lastEventAt: at };
  if (WORKING_EVENTS.has(ev.event)) return { base: "working", lastEventAt: at };
  return { ...state, lastEventAt: at };
}

export function applyEvents(state: SessionState, events: HookEvent[]): SessionState {
  return events.reduce(applyEvent, state);
}

export function deriveStatus(
  session: Pick<Session, "source" | "chatId" | "createdAt">,
  state: SessionState,
  pane: PaneInfo | undefined,
  now: number,
): Status {
  if (isStarting(session)) return now - session.createdAt > START_TIMEOUT_MS ? "exited" : "working";
  if (state.base === "none") {
    if (session.source === "import") return "imported";
    return isAlive(pane) ? "working" : "exited";
  }
  if (!pane || pane.dead || state.base === "exited") return "exited";
  if (state.base === "working" && now - state.lastEventAt > STALE_MS) return "stale";
  return state.base;
}

export const isStarting = (s: Pick<Session, "chatId">) => !s.chatId;

export const isAlive = (w: PaneInfo | undefined) => !!w && !w.dead;
