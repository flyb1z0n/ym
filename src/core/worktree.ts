import { existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { cursorHome } from "./paths.ts";

export interface GitWorktree {
  path: string;
  head?: string;
  branch?: string;
  isMain: boolean;
}

export function parseWorktreeList(output: string): GitWorktree[] {
  const blocks = output.trim().split(/\n\n+/).filter(Boolean);
  const worktrees: GitWorktree[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const lines = block.split("\n");
    let path = "";
    let head: string | undefined;
    let branch: string | undefined;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).trim();
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        branch = ref.replace(/^refs\/heads\//, "");
      }
    }
    if (path) {
      worktrees.push({
        path,
        head,
        branch,
        isMain: i === 0,
      });
    }
  }
  return worktrees;
}

function git(cwd: string, args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const p = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return {
      stdout: p.stdout.toString(),
      stderr: p.stderr.toString(),
      exitCode: p.exitCode,
    };
  } catch {
    return { stdout: "", stderr: "", exitCode: 1 };
  }
}

export function listWorktrees(cwd: string): GitWorktree[] {
  if (!existsSync(cwd)) return [];
  const res = git(cwd, ["worktree", "list", "--porcelain"]);
  if (res.exitCode !== 0) return [];
  return parseWorktreeList(res.stdout);
}

/** Removes the git worktree and its branch, plus any cursor worktree folder on disk. */
export function removeWorktree(cwd: string, worktreeName: string): void {
  if (!worktreeName) return;

  if (existsSync(cwd)) {
    const worktrees = listWorktrees(cwd);
    const target = worktrees.find(
      (wt) =>
        !wt.isMain &&
        (basename(wt.path) === worktreeName ||
          wt.path.endsWith(`/${worktreeName}`) ||
          wt.branch === worktreeName),
    );

    if (target) {
      git(cwd, ["worktree", "remove", "--force", target.path]);
      if (target.branch) git(cwd, ["branch", "-D", target.branch]);
      if (existsSync(target.path)) {
        try {
          rmSync(target.path, { recursive: true, force: true });
        } catch {
          // best-effort filesystem cleanup
        }
      }
    } else {
      // Branch might still exist even if worktree was pruned/unlinked
      git(cwd, ["branch", "-D", worktreeName]);
    }
    git(cwd, ["worktree", "prune"]);
  }

  // Check Cursor's worktree storage directory (~/.cursor/worktrees/*/<worktreeName>)
  const cursorWtRoot = join(cursorHome(), "worktrees");
  if (existsSync(cursorWtRoot)) {
    try {
      for (const repoDir of readdirSync(cursorWtRoot, { withFileTypes: true })) {
        if (!repoDir.isDirectory()) continue;
        const wtPath = join(cursorWtRoot, repoDir.name, worktreeName);
        if (existsSync(wtPath)) {
          rmSync(wtPath, { recursive: true, force: true });
        }
      }
    } catch {
      // best-effort cleanup
    }
  }
}
