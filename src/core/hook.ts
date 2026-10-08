import { appendEvent, loadSession, SESSION_ID_RE } from "./store.ts";
import type { HookEvent } from "./types.ts";

interface HookPayload {
  conversation_id?: string;
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

/** Fails open: never blocks the agent, always exits 0 with an empty response. */
export async function runHook(event: string): Promise<never> {
  try {
    const input = await Bun.stdin.text();
    const id = process.env.YM_SESSION_ID;
    if (id && SESSION_ID_RE.test(id) && /^\w+$/.test(event)) {
      let payload: HookPayload = {};
      try {
        payload = JSON.parse(input) as HookPayload;
      } catch {
        // Record the event even without a readable payload.
      }
      const ev = toEvent(event, payload, Date.now());
      const session = loadSession(id);
      if (
        event === "sessionEnd" &&
        session?.chatId &&
        ev.chatId &&
        ev.chatId !== session.chatId
      ) {
        // Subagent exit; the parent agent session is still running.
      } else {
        appendEvent(id, ev);
      }
    }
  } catch {
    // Fail open.
  }
  process.stdout.write("{}\n");
  process.exit(0);
}
