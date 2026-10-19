import { appendEvent, loadSession, saveSession, SESSION_ID_RE } from "./store.ts";
import type { HookEvent } from "./types.ts";

interface HookPayload {
  conversation_id?: string;
  /** Codex's id for the conversation. */
  session_id?: string;
  tool_name?: string;
  status?: string;
}

export function toEvent(event: string, payload: HookPayload, now: number): HookEvent {
  const ev: HookEvent = { ts: now, event };
  if (payload.conversation_id) ev.chatId = payload.conversation_id;
  if (payload.tool_name) ev.tool = payload.tool_name.slice(0, 80);
  if (event === "stop" && payload.status) ev.stopStatus = payload.status.slice(0, 40);
  return ev;
}

/** Codex hook names, translated to the Cursor event names status.ts understands. */
export const CODEX_EVENTS: Record<string, string> = {
  SessionStart: "sessionStart",
  UserPromptSubmit: "beforeSubmitPrompt",
  PreToolUse: "preToolUse",
  PostToolUse: "postToolUse",
  PermissionRequest: "permissionRequest",
  Stop: "stop",
  SessionEnd: "sessionEnd",
};

export function toCodexEvent(event: string, payload: HookPayload, now: number): HookEvent | undefined {
  const name = CODEX_EVENTS[event];
  if (!name) return undefined;
  const ev: HookEvent = { ts: now, event: name };
  if (payload.session_id) ev.chatId = payload.session_id;
  if (payload.tool_name) ev.tool = payload.tool_name.slice(0, 80);
  if (name === "stop") ev.stopStatus = "completed";
  return ev;
}

function readPayload(input: string): HookPayload {
  try {
    return JSON.parse(input) as HookPayload;
  } catch {
    // Record the event even without a readable payload.
    return {};
  }
}

function recordCursor(id: string, event: string, input: string): void {
  if (!/^\w+$/.test(event)) return;
  const ev = toEvent(event, readPayload(input), Date.now());
  const session = loadSession(id);
  // A subagent's sessionEnd; the parent agent session is still running.
  if (event === "sessionEnd" && session?.chatId && ev.chatId && ev.chatId !== session.chatId) return;
  appendEvent(id, ev);
}

function recordCodex(id: string, event: string, input: string): void {
  const ev = toCodexEvent(event, readPayload(input), Date.now());
  if (!ev) return;
  // Codex has no create-chat, so hooks are where ym learns the id to resume: SessionStart
  // (which also fires for /new), or any later event if the hooks were trusted mid-session.
  if (ev.chatId) {
    const session = loadSession(id);
    const update = ev.event === "sessionStart" ? session?.chatId !== ev.chatId : !session?.chatId;
    if (session && update) saveSession({ ...session, chatId: ev.chatId });
  }
  appendEvent(id, ev);
}

/** Fails open: never blocks the agent, always exits 0 with a no-op response. */
export async function runHook(event: string, agent?: string): Promise<never> {
  try {
    const input = await Bun.stdin.text();
    const id = process.env.YM_SESSION_ID;
    if (id && SESSION_ID_RE.test(id)) {
      if (agent === "codex") recordCodex(id, event, input);
      else recordCursor(id, event, input);
    }
  } catch {
    // Fail open.
  }
  // Codex treats empty output as "continue"; Cursor expects a JSON object.
  if (agent !== "codex") process.stdout.write("{}\n");
  process.exit(0);
}
