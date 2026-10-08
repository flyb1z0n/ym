import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeSession } from "../src/core/actions.ts";
import { saveSession, loadSession } from "../src/core/store.ts";
import type { Session } from "../src/core/types.ts";
import { listWorktrees, parseWorktreeList, removeWorktree } from "../src/core/worktree.ts";

const PORCELAIN_SAMPLE = `worktree /Users/alice/dev/myrepo
HEAD 8be15d12febcecd69c79c7d2516bbf2490bcf88c
branch refs/heads/main

worktree /Users/alice/.cursor/worktrees/myrepo/wt123456
HEAD 8be15d12febcecd69c79c7d2516bbf2490bcf88c
branch refs/heads/wt123456

worktree /Users/alice/.cursor/worktrees/myrepo/wt789012
HEAD 8be15d12febcecd69c79c7d2516bbf2490bcf88c
detached
`;

describe("worktree management", () => {
  let testDir: string;
  let repoDir: string;
  let cursorDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `ym-wt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    repoDir = join(testDir, "repo");
    cursorDir = join(testDir, "cursor");
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(cursorDir, { recursive: true });

    process.env.YM_HOME = join(testDir, "ym");
    process.env.YM_CURSOR_HOME = cursorDir;

    // Init git repo
    Bun.spawnSync(["git", "init", repoDir]);
    Bun.spawnSync(["git", "config", "user.name", "Test User"], { cwd: repoDir });
    Bun.spawnSync(["git", "config", "user.email", "test@example.com"], { cwd: repoDir });
    Bun.spawnSync(["git", "commit", "--allow-empty", "-m", "init"], { cwd: repoDir });
  });

  afterEach(() => {
    delete process.env.YM_HOME;
    delete process.env.YM_CURSOR_HOME;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("parseWorktreeList parses porcelain format correctly", () => {
    const list = parseWorktreeList(PORCELAIN_SAMPLE);
    expect(list).toHaveLength(3);

    expect(list[0]).toEqual({
      path: "/Users/alice/dev/myrepo",
      head: "8be15d12febcecd69c79c7d2516bbf2490bcf88c",
      branch: "main",
      isMain: true,
    });

    expect(list[1]).toEqual({
      path: "/Users/alice/.cursor/worktrees/myrepo/wt123456",
      head: "8be15d12febcecd69c79c7d2516bbf2490bcf88c",
      branch: "wt123456",
      isMain: false,
    });

    expect(list[2]).toEqual({
      path: "/Users/alice/.cursor/worktrees/myrepo/wt789012",
      head: "8be15d12febcecd69c79c7d2516bbf2490bcf88c",
      branch: undefined,
      isMain: false,
    });
  });

  test("removeWorktree cleans up git worktree, branch, and disk directory", () => {
    const wtDir = join(cursorDir, "worktrees", "repo", "wt123456");
    Bun.spawnSync(["git", "worktree", "add", "-b", "wt123456", wtDir], { cwd: repoDir });

    expect(existsSync(wtDir)).toBe(true);
    let worktrees = listWorktrees(repoDir);
    expect(worktrees.some((w) => w.branch === "wt123456")).toBe(true);

    // Call removeWorktree
    removeWorktree(repoDir, "wt123456");

    expect(existsSync(wtDir)).toBe(false);
    worktrees = listWorktrees(repoDir);
    expect(worktrees.some((w) => w.branch === "wt123456")).toBe(false);

    // Check branch is gone
    const res = Bun.spawnSync(["git", "branch", "--list", "wt123456"], { cwd: repoDir });
    expect(res.stdout.toString().trim()).toBe("");
  });

  test("removeWorktree never removes the main worktree", () => {
    const mainWorktreesBefore = listWorktrees(repoDir);
    expect(mainWorktreesBefore[0]?.isMain).toBe(true);

    removeWorktree(repoDir, "repo");
    expect(existsSync(repoDir)).toBe(true);
    expect(listWorktrees(repoDir)).toHaveLength(1);
  });

  test("removeWorktree handles already deleted worktree directory", () => {
    const wtDir = join(cursorDir, "worktrees", "repo", "wt_deleted");
    Bun.spawnSync(["git", "worktree", "add", "-b", "wt_deleted", wtDir], { cwd: repoDir });

    // Manually delete folder before calling removeWorktree
    rmSync(wtDir, { recursive: true, force: true });

    removeWorktree(repoDir, "wt_deleted");
    const worktrees = listWorktrees(repoDir);
    expect(worktrees.some((w) => w.branch === "wt_deleted")).toBe(false);

    const res = Bun.spawnSync(["git", "branch", "--list", "wt_deleted"], { cwd: repoDir });
    expect(res.stdout.toString().trim()).toBe("");
  });

  test("removeSession removes worktree and deletes session", () => {
    const wtDir = join(cursorDir, "worktrees", "repo", "sess1234");
    Bun.spawnSync(["git", "worktree", "add", "-b", "sess1234", wtDir], { cwd: repoDir });

    const session: Session = {
      id: "sess1234",
      name: "Test Session",
      cwd: repoDir,
      chatId: "chat-123",
      source: "ym",
      createdAt: Date.now(),
      worktree: "sess1234",
    };
    saveSession(session);

    expect(loadSession("sess1234")).toBeDefined();
    expect(existsSync(wtDir)).toBe(true);

    removeSession(session, undefined);

    expect(loadSession("sess1234")).toBeUndefined();
    expect(existsSync(wtDir)).toBe(false);
    expect(listWorktrees(repoDir).some((w) => w.branch === "sess1234")).toBe(false);
  });
});
