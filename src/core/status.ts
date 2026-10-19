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
  /** Tool calls still running; a single long tool call sends no events until it ends. */
  openTools: readonly string[];
}

export const initialState = (): SessionState => ({ base: "none", lastEventAt: 0, openTools: [] });

/** A tool call without its closing event (e.g. a timed-out hook) must not outlive the turn. */
const TURN_BOUNDARIES = new Set(["ymLaunch", "beforeSubmitPrompt", "stop", "sessionEnd"]);

/** Cursor emits sessionEnd for subagent chats too; only the main chatId should end the ym session. */
export function appliesToSession(ev: HookEvent, sessionChatId: string | undefined): boolean {
  if (ev.event !== "sessionEnd" || !sessionChatId || !ev.chatId) return true;
  return ev.chatId === sessionChatId;
}

type BaseState = Omit<SessionState, "openTools">;

function nextBase(state: SessionState, ev: HookEvent): BaseState {
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

function nextOpenTools(open: readonly string[], ev: HookEvent): readonly string[] {
  if (TURN_BOUNDARIES.has(ev.event)) return [];
  if (!ev.toolUseId) return open;
  if (ev.event === "preToolUse") return [...open, ev.toolUseId];
  if (ev.event === "postToolUse" || ev.event === "postToolUseFailure") return open.filter((id) => id !== ev.toolUseId);
  return open;
}

export function applyEvent(state: SessionState, ev: HookEvent, sessionChatId?: string): SessionState {
  if (!appliesToSession(ev, sessionChatId)) return state;
  return { ...nextBase(state, ev), openTools: nextOpenTools(state.openTools, ev) };
}

export function applyEvents(state: SessionState, events: HookEvent[], sessionChatId?: string): SessionState {
  return events.reduce((s, ev) => applyEvent(s, ev, sessionChatId), state);
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
  if (state.base === "working" && !state.openTools.length && now - state.lastEventAt > STALE_MS) return "stale";
  return state.base;
}

export const isStarting = (s: Pick<Session, "chatId">) => !s.chatId;

export const isAlive = (w: PaneInfo | undefined) => !!w && !w.dead;
