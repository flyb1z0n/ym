import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexCommand, findCodexSession } from "../src/core/codex.ts";
import { toCodexEvent } from "../src/core/hook.ts";
import { scanCodexChats } from "../src/core/importer.ts";
import {
  CODEX_HOOK_EVENTS,
  codexConfigPath,
  codexHooksPath,
  installCodex,
  isCodexInstalled,
  uninstallCodex,
} from "../src/core/install.ts";
import { hookShimFile } from "../src/core/paths.ts";
import { applyEvents, deriveStatus, initialState, STALE_MS } from "../src/core/status.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ym-codex-"));
  process.env.YM_HOME = join(dir, "ym");
  process.env.YM_CODEX_HOME = join(dir, "codex");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.YM_HOME;
  delete process.env.YM_CODEX_HOME;
});

describe("codex command", () => {
  test("starts in the folder with the prompt after --", () => {
    expect(
      codexCommand({ cwd: "/w", addDirs: ["/x"], prompt: "-review", images: ["/a b.png"], model: "gpt-6" }),
    ).toEqual(["codex", "-C", "/w", "-m", "gpt-6", "--add-dir", "/x", "--image=/a b.png", "--", "-review"]);
  });

  test("resumes by session id without a prompt", () => {
    expect(codexCommand({ cwd: "/w", chatId: "01a0" })).toEqual(["codex", "resume", "01a0", "-C", "/w"]);
  });
});

describe("codex hooks", () => {
  test("map onto ym's status events", () => {
    const payload = { session_id: "s1", tool_name: "Bash" };
    expect(toCodexEvent("UserPromptSubmit", payload, 1)).toEqual({ ts: 1, event: "beforeSubmitPrompt", chatId: "s1", tool: "Bash" });
    expect(toCodexEvent("Stop", {}, 2)).toEqual({ ts: 2, event: "stop", stopStatus: "completed" });
    expect(toCodexEvent("SubagentStart", {}, 3)).toBeUndefined();

    const s = { source: "ym" as const, chatId: "s1", createdAt: 0 };
    const alive = { paneId: "%1", dead: false, shown: false };
    const status = (events: string[]) =>
      deriveStatus(s, applyEvents(initialState(), events.map((e, i) => toCodexEvent(e, payload, i + 1)!)), alive, 10);
    expect(status(["SessionStart", "UserPromptSubmit", "PreToolUse"])).toBe("working");
    expect(status(["UserPromptSubmit", "PermissionRequest"])).toBe("your_turn");
    expect(status(["UserPromptSubmit", "Stop"])).toBe("your_turn");
    expect(status(["Stop", "SessionEnd"])).toBe("exited");
  });

  test("a long-running Codex tool call isn't stale", () => {
    const s = { source: "ym" as const, chatId: "s1", createdAt: 0 };
    const alive = { paneId: "%1", dead: false, shown: false };
    const call = { session_id: "s1", tool_name: "Bash", tool_use_id: "call_1" };
    const events = [toCodexEvent("UserPromptSubmit", call, 1)!, toCodexEvent("PreToolUse", call, 2)!];
    const later = 2 + STALE_MS + 1;
    expect(deriveStatus(s, applyEvents(initialState(), events), alive, later)).toBe("working");
    const done = [...events, toCodexEvent("PostToolUse", call, 3)!];
    expect(deriveStatus(s, applyEvents(initialState(), done), alive, 3 + STALE_MS + 1)).toBe("stale");
  });

  test("a launched Codex session without its id yet is running, not starting", () => {
    const launched = { source: "ym" as const, chatId: "", createdAt: 0, launchedAt: 1 };
    const state = applyEvents(initialState(), [{ ts: 1, event: "ymLaunch", withPrompt: true }]);
    expect(deriveStatus(launched, state, undefined, 10 * 60 * 1000)).toBe("exited");
    expect(deriveStatus(launched, state, { paneId: "%1", dead: false, shown: false }, 5)).toBe("working");
  });

  test("install merges into hooks.json, keeps the user's hooks, and uninstall removes only ym's", () => {
    expect(installCodex(["/opt/ym"])).toBeUndefined();
    mkdirSync(process.env.YM_CODEX_HOME!);
    const mine = { matcher: "Bash", hooks: [{ type: "command", command: "./mine.sh" }] };
    writeFileSync(codexHooksPath(), JSON.stringify({ description: "x", hooks: { PreToolUse: [mine] } }));

    installCodex(["/opt/ym"]);
    installCodex(["/opt/ym"]);
    const file = JSON.parse(readFileSync(codexHooksPath(), "utf8"));
    expect(file.description).toBe("x");
    expect(file.hooks.PreToolUse).toEqual([
      mine,
      { hooks: [{ type: "command", command: `${hookShimFile()} PreToolUse codex`, timeout: 5 }] },
    ]);
    expect(file.hooks.SessionEnd[0].hooks[0].timeout).toBe(3);
    expect(isCodexInstalled(["/opt/ym"])).toBe(true);
    expect(isCodexInstalled(["/other/ym"])).toBe(false);
    expect(existsSync(`${codexHooksPath()}.ym-bak`)).toBe(true);

    expect(uninstallCodex()).toBe(CODEX_HOOK_EVENTS.length);
    expect(JSON.parse(readFileSync(codexHooksPath(), "utf8")).hooks).toEqual({ PreToolUse: [mine] });
    expect(isCodexInstalled(["/opt/ym"])).toBe(false);
  });

  test("install trusts ym's worktree folder once in config.toml, and uninstall removes only that", () => {
    mkdirSync(process.env.YM_CODEX_HOME!);
    const config = 'model = "gpt-6"\n\n[projects."/p"]\ntrust_level = "trusted"';
    writeFileSync(codexConfigPath(), config);
    installCodex(["/opt/ym"]);
    installCodex(["/opt/ym"]);
    const worktrees = realpathSync(join(process.env.YM_HOME!, "worktrees"));
    expect(readFileSync(codexConfigPath(), "utf8")).toBe(
      `${config}\n\n[projects."${worktrees}"]\ntrust_level = "trusted"\n`,
    );
    uninstallCodex();
    expect(readFileSync(codexConfigPath(), "utf8")).toBe(`${config}\n`);
  });

  test("install leaves a user's own entry for ym's worktree folder alone", () => {
    mkdirSync(process.env.YM_CODEX_HOME!);
    mkdirSync(join(process.env.YM_HOME!, "worktrees"), { recursive: true });
    const worktrees = realpathSync(join(process.env.YM_HOME!, "worktrees"));
    const config = `[projects."${worktrees}"]\ntrust_level = "untrusted"\n`;
    writeFileSync(codexConfigPath(), config);
    installCodex(["/opt/ym"]);
    expect(readFileSync(codexConfigPath(), "utf8")).toBe(config);
  });
});

describe("codex sessions", () => {
  function rollout(id: string, cwd: string, timestamp: string, originator = "codex-tui") {
    const day = join(process.env.YM_CODEX_HOME!, "sessions", "2026", "10", "19");
    mkdirSync(day, { recursive: true });
    const meta = { session_id: id, id, timestamp, cwd, originator, base_instructions: { text: "x".repeat(40_000) } };
    writeFileSync(join(day, `rollout-${timestamp}-${id}.jsonl`), `${JSON.stringify({ type: "session_meta", payload: meta })}\n{}\n`);
  }

  test("import lists interactive sessions with Codex's thread names", () => {
    rollout("a", "/p/one", "2026-10-19T10:00:00.000Z");
    rollout("b", "/p/two", "2026-10-19T11:00:00.000Z");
    rollout("c", "/p/two", "2026-10-19T12:00:00.000Z", "codex_exec");
    writeFileSync(join(process.env.YM_CODEX_HOME!, "session_index.jsonl"), `${JSON.stringify({ id: "a", thread_name: "Fix login" })}\n`);
    const chats = scanCodexChats();
    expect(chats.map((c) => [c.agent, c.chatId, c.cwd, c.title]).sort()).toEqual([
      ["codex", "a", "/p/one", "Fix login"],
      ["codex", "b", "/p/two", "(untitled)"],
    ]);
  });

  test("findCodexSession picks the first session in the folder since launch", () => {
    rollout("old", dir, "2026-10-19T09:00:00.000Z");
    rollout("new", dir, "2026-10-19T10:00:05.000Z");
    rollout("newer", dir, "2026-10-19T10:00:09.000Z");
    rollout("elsewhere", "/p/other", "2026-10-19T10:00:01.000Z");
    expect(findCodexSession(dir, Date.parse("2026-10-19T10:00:00.000Z"))).toBe("new");
    expect(findCodexSession(dir, Date.parse("2026-10-19T11:00:00.000Z"))).toBeUndefined();
  });
});
