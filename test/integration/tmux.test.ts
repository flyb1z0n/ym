import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-it-")));
const extra = join(dir, "extra");
mkdirSync(extra);
Bun.spawnSync(["git", "init", "-q", dir]);
const plain = realpathSync(mkdtempSync(join(tmpdir(), "ym-it-plain-")));
process.env.YM_HOME = join(dir, "home");
process.env.YM_TMUX_SOCKET = `ym-test-${process.pid}`;
process.env.YM_AGENT_BIN = resolve(import.meta.dir, "stub-agent.sh");
process.env.YM_TEST_SELF = `${process.execPath} ${resolve(import.meta.dir, "../../src/cli.tsx")}`;
process.env.YM_NO_NOTIFY = "1";
chmodSync(process.env.YM_AGENT_BIN, 0o755);

const actions = await import("../../src/core/actions.ts");
const tmux = await import("../../src/core/tmux.ts");
const { saveSettings } = await import("../../src/core/settings.ts");
const { EventReader, listSessions } = await import("../../src/core/store.ts");
const { applyEvents, deriveStatus, initialState } = await import("../../src/core/status.ts");

const reader = new EventReader();
const states = new Map<string, ReturnType<typeof initialState>>();
const pane = (id: string) => tmux.listAgentPanes().get(id);

function statusOf(id: string) {
  const session = listSessions().find((s) => s.id === id)!;
  const state = applyEvents(states.get(id) ?? initialState(), reader.read(id), session.chatId || undefined);
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
  rmSync(plain, { recursive: true, force: true });
});

describe("tmux integration with a stub agent", () => {
  test("dashboard window has the UI pane and a placeholder", () => {
    expect(dashPanes()).toHaveLength(2);
    expect(tmux.listAgentPanes().size).toBe(0);
  });

  test("inactive panes are dimmed", () => {
    expect(tmux.tmux(["show-option", "-gv", "window-style"]).stdout.trim()).toMatch(/^(dim=30|fg=colour245)$/);
    expect(tmux.tmux(["show-option", "-gv", "window-active-style"]).stdout.trim()).toBe("default");
  });

  test("launch, show in dashboard, reply, exit, resume in place, stop", async () => {
    const s = await actions.startSession({ prompt: "do the thing", folders: [dir, extra] });
    expect(s.addDirs).toEqual([extra]);
    expect(s.worktree).toBe("do-the-thing");
    await waitFor(s.id, "your_turn");
    const p = pane(s.id)!;
    expect(tmux.capturePane(p.paneId)).toContain(`--worktree do-the-thing --add-dir ${extra} do the thing`);

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
    expect(tmux.capturePane(p.paneId)).toContain("--worktree do-the-thing");

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
    const preview = tmux.tmux(["display-message", "-p", "-t", dashPanes()[1]!, "#{pane_width}x#{pane_height}"]).stdout.trim();
    expect(tmux.tmux(["display-message", "-p", "-t", pane(a.id)!.paneId, "#{pane_width}x#{pane_height}"]).stdout.trim()).toBe(preview);
    tmux.show(pane(a.id)!.paneId);
    tmux.show(pane(b.id)!.paneId);
    expect(pane(a.id)?.shown).toBe(false);
    expect(pane(b.id)?.shown).toBe(true);
    expect(tmux.tmux(["display-message", "-p", "-t", pane(a.id)!.paneId, "#{pane_width}x#{pane_height}"]).stdout.trim()).toBe(preview);
    expect(tmux.tmux(["display-message", "-p", "-t", pane(b.id)!.paneId, "#{pane_width}x#{pane_height}"]).stdout.trim()).toBe(preview);
    tmux.unshow();
    expect(pane(b.id)?.shown).toBe(false);
    expect(dashPanes()).toHaveLength(2);
  }, 30000);

  test("the placeholder spins while a session starts and goes back to the idle hint", async () => {
    const placeholder = dashPanes()[1]!;
    tmux.unshow("Starting Cursor…");
    await Bun.sleep(400);
    expect(tmux.capturePane(placeholder)).toMatch(/[✶✸✹✺✷] Starting Cursor…/);

    tmux.unshow();
    await Bun.sleep(200);
    expect(tmux.capturePane(placeholder)).toContain("Nothing running here.");
  });

  test("a new session is listed as working before its chat exists", async () => {
    let listed: string | undefined;
    const started = actions.startSession({ prompt: "early", folders: [dir] }, (draft) => {
      listed = statusOf(draft.id);
      expect(() => actions.resumeSession(draft, undefined)).toThrow("still starting");
    });
    expect(listed).toBe("working");
    const s = await started;
    expect(s.chatId).not.toBe("");
    await waitFor(s.id, "your_turn");
    actions.stopSession(pane(s.id));
  }, 30000);

  test("removing a session while its chat is being created skips the launch", async () => {
    let id = "";
    const started = actions.startSession({ prompt: "gone", folders: [dir] }, (draft) => {
      id = draft.id;
      actions.removeSession(draft, undefined);
    });
    await expect(started).rejects.toThrow("removed before Cursor started");
    expect(pane(id)).toBeUndefined();
    expect(listSessions().some((s) => s.id === id)).toBe(false);
  });

  test("the setting can disable worktrees for new sessions", async () => {
    saveSettings({ useWorktrees: false, nameWorktrees: true });
    try {
      const s = await actions.startSession({ prompt: "shared workspace", folders: [dir] });
      expect(s.worktree).toBeUndefined();
      await waitFor(s.id, "your_turn");
      const p = pane(s.id)!;
      expect(tmux.capturePane(p.paneId)).not.toContain("--worktree");
      actions.stopSession(p);
    } finally {
      saveSettings({ useWorktrees: true, nameWorktrees: true });
    }
  }, 30000);

  test("a folder outside git gets a regular session even with worktrees on", async () => {
    const s = await actions.startSession({ prompt: "not a repo", folders: [plain] });
    expect(s.worktree).toBeUndefined();
    await waitFor(s.id, "your_turn");
    const p = pane(s.id)!;
    expect(tmux.capturePane(p.paneId)).not.toContain("--worktree");
    actions.stopSession(p);
  }, 30000);

  test("a prompt with images is pasted into the prompt bar instead of passed as an argument", async () => {
    const image = join(plain, "shot one.png");
    writeFileSync(image, "x");
    const s = await actions.startSession({ prompt: "look at [Image #1]", folders: [dir], images: [image] });
    await waitFor(s.id, "your_turn");
    const screen = tmux.capturePane(pane(s.id)!.paneId);
    expect(screen).toContain(`got: look at ${plain}/shot\\ one.png`);
    expect(screen).not.toContain("--trust look at");
    actions.stopSession(pane(s.id));
  }, 30000);

  test("with naming disabled, or no prompt, the worktree is named after the session id", async () => {
    const empty = await actions.startSession({ prompt: "", folders: [dir] });
    expect(empty.worktree).toBe(empty.id);
    actions.stopSession(pane(empty.id));

    saveSettings({ useWorktrees: true, nameWorktrees: false });
    try {
      const s = await actions.startSession({ prompt: "do the thing", folders: [dir] });
      expect(s.worktree).toBe(s.id);
      await waitFor(s.id, "your_turn");
      expect(tmux.capturePane(pane(s.id)!.paneId)).toContain(`--worktree ${s.id}`);
      actions.stopSession(pane(s.id));
    } finally {
      saveSettings({ useWorktrees: true, nameWorktrees: true });
    }
  }, 30000);
});
