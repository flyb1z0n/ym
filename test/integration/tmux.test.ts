import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ym-it-"));
process.env.YM_HOME = join(dir, "home");
process.env.YM_TMUX_SOCKET = `ym-test-${process.pid}`;
process.env.YM_AGENT_BIN = resolve(import.meta.dir, "stub-agent.sh");
process.env.YM_TEST_SELF = `${process.execPath} ${resolve(import.meta.dir, "../../src/cli.tsx")}`;
process.env.YM_NO_NOTIFY = "1";
chmodSync(process.env.YM_AGENT_BIN, 0o755);

const actions = await import("../../src/core/actions.ts");
const tmux = await import("../../src/core/tmux.ts");
const { EventReader, listSessions } = await import("../../src/core/store.ts");
const { applyEvents, deriveStatus, initialState } = await import("../../src/core/status.ts");

const reader = new EventReader();
const states = new Map<string, ReturnType<typeof initialState>>();
function statusOf(id: string) {
  const session = listSessions().find((s) => s.id === id)!;
  const state = applyEvents(states.get(id) ?? initialState(), reader.read(id));
  states.set(id, state);
  return deriveStatus(session, state, tmux.listWindows().get(id), Date.now());
}

async function waitFor(id: string, want: string, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < end) {
    last = statusOf(id);
    if (last === want) return;
    await Bun.sleep(100);
  }
  throw new Error(`status stayed ${last}, wanted ${want}`);
}

beforeAll(() => {
  tmux.startServer(["sleep", "600"], dir);
});
afterAll(() => {
  tmux.tmux(["kill-server"]);
  rmSync(dir, { recursive: true, force: true });
});

describe("tmux integration with a stub agent", () => {
  test("launch, reply, exit, resume", async () => {
    const s = await actions.startSession({ prompt: "do the thing", cwd: dir });
    expect(s.chatId).toBe("11111111-2222-3333-4444-555555555555");
    await waitFor(s.id, "your_turn");
    expect(tmux.capturePane(s.id)).toContain("stub agent: --resume 11111111");

    tmux.sendLine(s.id, "hello");
    await waitFor(s.id, "your_turn");
    expect(tmux.capturePane(s.id)).toContain("got: hello");

    tmux.sendLine(s.id, "exit");
    await waitFor(s.id, "exited");
    expect(tmux.listWindows().get(s.id)?.dead).toBe(true);

    actions.resumeSession(s);
    await waitFor(s.id, "your_turn");
    expect(tmux.listWindows().get(s.id)?.dead).toBe(false);

    actions.stopSession(s);
    await waitFor(s.id, "exited");
  }, 30000);
});
