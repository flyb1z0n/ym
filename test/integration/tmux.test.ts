import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-it-")));
const extra = join(dir, "extra");
mkdirSync(extra);
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
const pane = (id: string) => tmux.listAgentPanes().get(id);

function statusOf(id: string) {
  const session = listSessions().find((s) => s.id === id)!;
  const state = applyEvents(states.get(id) ?? initialState(), reader.read(id));
  states.set(id, state);
  return deriveStatus(session, state, pane(id), Date.now());
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

const dashPanes = () =>
  tmux.tmux(["list-panes", "-t", "ym:=dash", "-F", "#{pane_id}"]).stdout.split("\n").filter(Boolean);

beforeAll(() => {
  tmux.startServer(["sleep", "600"], dir);
});
afterAll(() => {
  tmux.tmux(["kill-server"]);
  rmSync(dir, { recursive: true, force: true });
});

describe("tmux integration with a stub agent", () => {
  test("dashboard window has the UI pane and a placeholder", () => {
    expect(dashPanes()).toHaveLength(2);
    expect(tmux.listAgentPanes().size).toBe(0);
  });

  test("inactive panes are dimmed", () => {
    expect(tmux.tmux(["show-option", "-gv", "window-style"]).stdout.trim()).toBe("fg=colour245");
    expect(tmux.tmux(["show-option", "-gv", "window-active-style"]).stdout.trim()).toBe("fg=default");
  });

  test("launch, show in dashboard, reply, exit, resume in place, stop", async () => {
    const s = await actions.startSession({ prompt: "do the thing", folders: [dir, extra] });
    expect(s.addDirs).toEqual([extra]);
    await waitFor(s.id, "your_turn");
    const p = pane(s.id)!;
    expect(tmux.capturePane(p.paneId)).toContain(`--add-dir ${extra} do the thing`);

    tmux.show(p.paneId);
    expect(pane(s.id)?.shown).toBe(true);
    expect(dashPanes()).toContain(p.paneId);

    tmux.sendLine(p.paneId, "hello");
    await waitFor(s.id, "your_turn");
    expect(tmux.capturePane(p.paneId)).toContain("got: hello");

    tmux.sendLine(p.paneId, "exit");
    await waitFor(s.id, "exited");
    expect(pane(s.id)?.dead).toBe(true);

    actions.resumeSession(s, pane(s.id));
    await waitFor(s.id, "your_turn");
    expect(pane(s.id)).toEqual({ paneId: p.paneId, dead: false, shown: true });

    actions.stopSession(pane(s.id));
    await waitFor(s.id, "exited");
    expect(pane(s.id)).toBeUndefined();
    expect(dashPanes()).toHaveLength(2);
  }, 30000);

  test("reopening restarts a dashboard from an older build and adopts untagged agent panes", () => {
    const uiPid = () => tmux.tmux(["display-message", "-p", "-t", "ym:=dash.0", "#{pane_pid}"]).stdout.trim();
    tmux.tmux(["new-window", "-d", "-t", "ym:", "-n", "abcdef12", "sleep", "600"]);
    tmux.recordBuild("build-1");
    const before = uiPid();

    tmux.ensureDashWindow(["sleep", "600"], dir, "build-1");
    expect(uiPid()).toBe(before);

    tmux.ensureDashWindow(["sleep", "600"], dir, "build-2");
    expect(uiPid()).not.toBe(before);
    expect(tmux.listAgentPanes().has("abcdef12")).toBe(true);
    tmux.tmux(["kill-window", "-t", "ym:=abcdef12"]);
  });

  test("switching the shown session swaps panes back to their own windows", async () => {
    const a = await actions.startSession({ prompt: "a", folders: [dir] });
    const b = await actions.startSession({ prompt: "b", folders: [dir] });
    await waitFor(a.id, "your_turn");
    await waitFor(b.id, "your_turn");
    tmux.show(pane(a.id)!.paneId);
    tmux.show(pane(b.id)!.paneId);
    expect(pane(a.id)?.shown).toBe(false);
    expect(pane(b.id)?.shown).toBe(true);
    tmux.unshow();
    expect(pane(b.id)?.shown).toBe(false);
    expect(dashPanes()).toHaveLength(2);
  }, 30000);
});
