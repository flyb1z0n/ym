import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { isGitRepo, slugify, suggestWorktreeName, uniqueWorktreeName } from "../src/core/naming.ts";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-naming-")));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env.YM_AGENT_BIN;
  delete process.env.YM_CURSOR_HOME;
});

function fakeAgent(name: string, script: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/bash\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("slugify", () => {
  test("keeps clean kebab-case names", () => {
    expect(slugify("add-tmux-inactive-pane-dimming\n")).toBe("add-tmux-inactive-pane-dimming");
  });

  test("normalises case, punctuation, quotes and backticks", () => {
    expect(slugify("`Fix: Auth Token_Refresh!`")).toBe("fix-auth-token-refresh");
  });

  test("uses the last non-empty line when the model adds a preamble", () => {
    expect(slugify("Here is a name:\n\nfix-login-redirect\n")).toBe("fix-login-redirect");
  });

  test("cuts long names at a word boundary", () => {
    const name = slugify("add-a-very-long-branch-name-that-keeps-going-and-going-forever")!;
    expect(name.length).toBeLessThanOrEqual(50);
    expect(name).toBe("add-a-very-long-branch-name-that-keeps-going-and");
  });

  test("returns undefined when nothing usable is left", () => {
    expect(slugify("")).toBeUndefined();
    expect(slugify("!!! \n ...")).toBeUndefined();
  });
});

describe("uniqueWorktreeName", () => {
  const repo = join(dir, "myrepo");
  const cursor = join(dir, "cursor");
  mkdirSync(repo);
  Bun.spawnSync(["git", "init", "-q", "-b", "main", repo]);
  Bun.spawnSync(["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"]);

  test("isGitRepo tells repos and their subfolders from plain folders", () => {
    mkdirSync(join(repo, "sub"));
    expect(isGitRepo(repo)).toBe(true);
    expect(isGitRepo(join(repo, "sub"))).toBe(true);
    expect(isGitRepo(dir)).toBe(false);
    expect(isGitRepo(join(dir, "missing"))).toBe(false);
  });

  test("returns the name unchanged outside a git repo", () => {
    expect(uniqueWorktreeName("fix-thing", dir)).toBe("fix-thing");
  });

  test("returns the name unchanged when it is free", () => {
    process.env.YM_CURSOR_HOME = cursor;
    expect(uniqueWorktreeName("fix-thing", repo)).toBe("fix-thing");
  });

  test("skips names taken by a Cursor worktree folder or an existing branch", () => {
    process.env.YM_CURSOR_HOME = cursor;
    mkdirSync(join(cursor, "worktrees", "myrepo", "fix-thing"), { recursive: true });
    Bun.spawnSync(["git", "-C", repo, "branch", "fix-thing-2"]);
    expect(uniqueWorktreeName("fix-thing", repo)).toBe("fix-thing-3");
  });
});

describe("suggestWorktreeName", () => {
  test("slugifies the agent's answer and passes the prompt as the last argument", async () => {
    process.env.YM_AGENT_BIN = fakeAgent("ok.sh", 'echo "Fix The Bug"; echo "${!#}" > "$(dirname "$0")/last-prompt"');
    expect(await suggestWorktreeName("the login page crashes")).toBe("fix-the-bug");
    expect(await Bun.file(join(dir, "last-prompt")).text()).toContain("the login page crashes");
  });

  test("runs the agent with a throwaway config dir so its model never becomes the CLI default", async () => {
    process.env.YM_AGENT_BIN = fakeAgent(
      "config.sh",
      'echo "$CURSOR_CONFIG_DIR" > "$(dirname "$0")/config-dir"; [ -d "$CURSOR_CONFIG_DIR" ] && echo add-thing',
    );
    expect(await suggestWorktreeName("anything")).toBe("add-thing");
    const configDir = (await Bun.file(join(dir, "config-dir")).text()).trim();
    expect(configDir).not.toBe("");
    expect(configDir).not.toBe(join(homedir(), ".cursor"));
    expect(existsSync(configDir)).toBe(false);
  });

  test("returns undefined when the agent fails or is missing", async () => {
    process.env.YM_AGENT_BIN = fakeAgent("fail.sh", "echo 'Model not found' >&2; exit 1");
    expect(await suggestWorktreeName("anything")).toBeUndefined();

    process.env.YM_AGENT_BIN = join(dir, "does-not-exist");
    expect(await suggestWorktreeName("anything")).toBeUndefined();
  });
});
