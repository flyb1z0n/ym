import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
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

async function gitAsync(cwd: string, args: string[]): Promise<{ stdout: string; exitCode: number }> {
  try {
    const p = Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    const [stdout, exitCode] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    return { stdout, exitCode };
  } catch {
    return { stdout: "", exitCode: 1 };
  }
}

export function listWorktrees(cwd: string): GitWorktree[] {
  if (!existsSync(cwd)) return [];
  const res = git(cwd, ["worktree", "list", "--porcelain"]);
  if (res.exitCode !== 0) return [];
  return parseWorktreeList(res.stdout);
}

/** Deletes the folder, reporting whether it's actually gone. */
async function removeDir(path: string): Promise<boolean> {
  await rm(path, { recursive: true, force: true }).catch(() => {});
  return !existsSync(path);
}

/**
 * Removes the git worktree and its branch, plus any cursor worktree folder on disk.
 * Async because worktrees can hold large trees (node_modules) that would freeze the UI if deleted synchronously.
 * Throws if a worktree folder is still on disk afterwards.
 */
export async function removeWorktree(cwd: string, worktreeName: string): Promise<void> {
  if (!worktreeName) return;
  const leftovers: string[] = [];

  if (existsSync(cwd)) {
    const list = await gitAsync(cwd, ["worktree", "list", "--porcelain"]);
    const worktrees = list.exitCode === 0 ? parseWorktreeList(list.stdout) : [];
    const target = worktrees.find(
      (wt) =>
        !wt.isMain &&
        (basename(wt.path) === worktreeName ||
          wt.path.endsWith(`/${worktreeName}`) ||
          wt.branch === worktreeName),
    );

    if (target) {
      await gitAsync(cwd, ["worktree", "remove", "--force", target.path]);
      if (target.branch) await gitAsync(cwd, ["branch", "-D", target.branch]);
      if (!(await removeDir(target.path))) leftovers.push(target.path);
    } else {
      // Branch might still exist even if worktree was pruned/unlinked
      await gitAsync(cwd, ["branch", "-D", worktreeName]);
    }
    await gitAsync(cwd, ["worktree", "prune"]);
  }

  // Check Cursor's worktree storage directory (~/.cursor/worktrees/*/<worktreeName>)
  const cursorWtRoot = join(cursorHome(), "worktrees");
  if (existsSync(cursorWtRoot)) {
    for (const repoDir of readdirSync(cursorWtRoot, { withFileTypes: true })) {
      if (!repoDir.isDirectory()) continue;
      const wtPath = join(cursorWtRoot, repoDir.name, worktreeName);
      if (existsSync(wtPath) && !leftovers.includes(wtPath) && !(await removeDir(wtPath))) leftovers.push(wtPath);
    }
  }

  if (leftovers.length) throw new Error(`Couldn't remove worktree: ${leftovers.join(", ")}`);
}
