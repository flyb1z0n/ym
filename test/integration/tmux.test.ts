import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-it-")));
const extra = join(dir, "extra");
mkdirSync(extra);
Bun.spawnSync(["git", "init", "-q", dir]);
const plain = realpathSync(mkdtempSync(join(tmpdir(), "ym-it-plain-")));
process.env.YM_HOME = join(dir, "home");
process.env.YM_TMUX_SOCKET = `ym-test-${process.pid}`;
process.env.YM_AGENT_BIN = resolve(import.meta.dir, "stub-agent.sh");
process.env.YM_CODEX_BIN = resolve(import.meta.dir, "stub-codex.sh");
process.env.YM_CODEX_HOME = join(dir, "codex");
process.env.YM_TEST_SELF = `${process.execPath} ${resolve(import.meta.dir, "../../src/cli.tsx")}`;
process.env.YM_NO_NOTIFY = "1";
chmodSync(process.env.YM_AGENT_BIN, 0o755);
chmodSync(process.env.YM_CODEX_BIN, 0o755);

const actions = await import("../../src/core/actions.ts");
const tmux = await import("../../src/core/tmux.ts");
const { saveSettings } = await import("../../src/core/settings.ts");
const { EventReader, listSessions, loadSession } = await import("../../src/core/store.ts");
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

  test("panes can be focused by clicking, even without a tmux.conf that enables the mouse", () => {
    expect(tmux.tmux(["show-option", "-gv", "mouse"]).stdout.trim()).toBe("on");
  });

  test("panes are told they can use truecolor, even when the client's env lacks COLORTERM", () => {
    expect(tmux.tmux(["show-environment", "-g", "COLORTERM"]).stdout.trim()).toBe("COLORTERM=truecolor");
  });

  test("the dashboard knows whether the latest client attached through ym ssh", async () => {
    const attach = async (env: Record<string, string>) => {
      const client = Bun.spawn(["tmux", "-L", tmux.SOCKET(), "attach-session", "-t", "=ym"], {
        env: { ...process.env, TERM: "xterm", ...env },
        terminal: { cols: 80, rows: 24, data() {} },
      });
      const end = Date.now() + 5000;
      while (!tmux.tmux(["list-clients"]).stdout.trim() && Date.now() < end) await Bun.sleep(50);
      tmux.detachClient();
      await client.exited;
    };
    await attach({ [tmux.REMOTE_ENV]: "me@devbox" });
    expect(tmux.remoteHost()).toBe("me@devbox");
    await attach({});
    expect(tmux.remoteHost()).toBeUndefined();
  });

  test("panes that ask for extended keys get Shift-Enter as CSI u", () => {
    if (!tmux.csiUKeys()) return; // tmux < 3.5
    expect(tmux.tmux(["show-options", "-sv", "extended-keys"]).stdout.trim()).toBe("on");
    tmux.configureServer();
    const features = tmux.tmux(["show-options", "-s", "terminal-features"]).stdout;
    expect(features.split("*:extkeys")).toHaveLength(2);
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
      void actions.removeSession(draft, undefined);
    });
    await expect(started).rejects.toThrow("removed before Cursor started");
    expect(pane(id)).toBeUndefined();
    expect(listSessions().some((s) => s.id === id)).toBe(false);
  });

  test("the setting can disable worktrees for new sessions", async () => {
    saveSettings({ useWorktrees: false, nameWorktrees: true, nameSessions: true, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
    try {
      const s = await actions.startSession({ prompt: "shared workspace", folders: [dir] });
      expect(s.worktree).toBeUndefined();
      await waitFor(s.id, "your_turn");
      const p = pane(s.id)!;
      expect(tmux.capturePane(p.paneId)).not.toContain("--worktree");
      actions.stopSession(p);
    } finally {
      saveSettings({ useWorktrees: true, nameWorktrees: true, nameSessions: true, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
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
    expect(s).toMatchObject({ prompt: "look at [Image #1]", images: [image] });
    await waitFor(s.id, "your_turn");
    const screen = tmux.capturePane(pane(s.id)!.paneId);
    expect(screen).toContain(`got: look at ${plain}/shot\\ one.png`);
    expect(screen).not.toContain("--trust look at");
    actions.stopSession(pane(s.id));
  }, 30000);

  test("the session's prompt-based name is replaced by the model's title once it's ready", async () => {
    let listedAs = "";
    const s = await actions.startSession({ prompt: "do the thing", folders: [dir] }, (draft) => {
      listedAs = draft.name;
    });
    expect(listedAs).toBe("do the thing");
    const end = Date.now() + 8000;
    while (loadSession(s.id)?.name !== "Do the thing for the user" && Date.now() < end) await Bun.sleep(100);
    expect(loadSession(s.id)?.name).toBe("Do the thing for the user");
    await waitFor(s.id, "your_turn");
    actions.stopSession(pane(s.id));
  }, 30000);

  test("a rename before the title is ready, or the setting turned off, keeps the session's name", async () => {
    const renamed = await actions.startSession({ prompt: "do the thing", folders: [plain] }, (draft) =>
      actions.renameSession(draft, "mine"),
    );
    saveSettings({ useWorktrees: true, nameWorktrees: true, nameSessions: false, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
    try {
      const plainName = await actions.startSession({ prompt: "do the thing", folders: [plain] });
      await waitFor(renamed.id, "your_turn");
      await waitFor(plainName.id, "your_turn");
      await Bun.sleep(500);
      expect(loadSession(renamed.id)?.name).toBe("mine");
      expect(loadSession(plainName.id)?.name).toBe("do the thing");
      actions.stopSession(pane(renamed.id));
      actions.stopSession(pane(plainName.id));
    } finally {
      saveSettings({ useWorktrees: true, nameWorktrees: true, nameSessions: true, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
    }
  }, 30000);

  test("with naming disabled, or no prompt, the worktree is named after the session id", async () => {
    const empty = await actions.startSession({ prompt: "", folders: [dir] });
    expect(empty.worktree).toBe(empty.id);
    actions.stopSession(pane(empty.id));

    saveSettings({ useWorktrees: true, nameWorktrees: false, nameSessions: true, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
    try {
      const s = await actions.startSession({ prompt: "do the thing", folders: [dir] });
      expect(s.worktree).toBe(s.id);
      await waitFor(s.id, "your_turn");
      expect(tmux.capturePane(pane(s.id)!.paneId)).toContain(`--worktree ${s.id}`);
      actions.stopSession(pane(s.id));
    } finally {
      saveSettings({ useWorktrees: true, nameWorktrees: true, nameSessions: true, callMeMain: false, defaultAgent: "cursor", cursorAutoRun: false });
    }
  }, 30000);
});

describe("tmux integration with a stub codex", () => {
  const stubId = (ymId: string) => `01a00000-0000-7000-8000-0000000000${ymId.slice(0, 2)}`;
  const hooksOff = () => join(process.env.YM_HOME!, "codex-hooks-off");
  // Codex's command line wraps over many rows, so read the scrollback too.
  const history = (id: string) => tmux.tmux(["capture-pane", "-p", "-J", "-S", "-", "-t", pane(id)!.paneId]).stdout;
  async function waitForText(id: string, text: string, timeoutMs = 8000) {
    const end = Date.now() + timeoutMs;
    while (!history(id).includes(text)) {
      if (Date.now() > end) throw new Error(`pane never showed: ${text}\n${history(id)}`);
      await Bun.sleep(100);
    }
  }

  test("launch in a ym worktree, learn the id from hooks, exit, resume by id, remove", async () => {
    // `git worktree add` needs a commit to branch from.
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"]);
    const s = await actions.startSession({ prompt: "-fix the thing", folders: [dir, extra], agent: "codex" });
    expect(s.agent).toBe("codex");
    expect(s.worktree).toMatch(/^do-the-thing(-\d+)?$/);
    const wt = join(process.env.YM_HOME!, "worktrees", basename(dir), s.worktree!);
    await waitFor(s.id, "your_turn");
    expect(loadSession(s.id)?.chatId).toBe(stubId(s.id));
    const p = pane(s.id)!;
    expect(history(s.id)).toContain(`stub codex: -C ${wt} --add-dir ${extra} -- -fix the thing`);
    expect(history(s.id)).toContain(`cwd: ${wt}`);

    tmux.sendLine(p.paneId, "exit");
    await waitFor(s.id, "exited");
    actions.resumeSession(loadSession(s.id)!, pane(s.id));
    await waitForText(s.id, `stub codex: resume ${stubId(s.id)} -C ${wt}`);
    await waitFor(s.id, "your_turn");

    await actions.removeSession(loadSession(s.id)!, pane(s.id));
    expect(existsSync(wt)).toBe(false);
  }, 30000);

  test("with untrusted hooks it still runs, and resume finds the session Codex saved", async () => {
    writeFileSync(hooksOff(), "");
    try {
      const s = await actions.startSession({ prompt: "quiet", folders: [plain], agent: "codex" });
      expect(statusOf(s.id)).toBe("working");
      await waitForText(s.id, "Ask Codex");
      expect(loadSession(s.id)?.chatId).toBe("");

      actions.stopSession(pane(s.id));
      actions.resumeSession(loadSession(s.id)!, pane(s.id));
      expect(loadSession(s.id)?.chatId).toBe(stubId(s.id));
      await waitForText(s.id, `stub codex: resume ${stubId(s.id)} -C ${plain}`);
      actions.stopSession(pane(s.id));
    } finally {
      rmSync(hooksOff(), { force: true });
    }
  }, 30000);

  test("the dashboard window is never locked to a fixed size", async () => {
    const dashSize = () => tmux.tmux(["show-options", "-wqv", "-t", "ym:=dash", "window-size"]).stdout.trim();
    const s = await actions.startSession({ prompt: "locked", folders: [dir] });
    await waitFor(s.id, "your_turn");
    const placeholder = dashPanes()[1]!;
    tmux.show(pane(s.id)!.paneId);
    tmux.tmux(["kill-pane", "-t", placeholder]);
    tmux.unshow();
    expect(dashSize()).toBe("");

    tmux.tmux(["resize-window", "-t", "ym:=dash", "-x", "40", "-y", "20"]);
    expect(dashSize()).toBe("manual");
    tmux.ensureDashWindow(["sleep", "600"], dir, tmux.runningBuild());
    expect(dashSize()).toBe("");
    actions.stopSession(pane(s.id));
    tmux.ensureDashLayout(dir);
    expect(dashPanes()).toHaveLength(2);
  }, 30000);
});
