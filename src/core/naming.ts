import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { AGENT_BIN } from "./cursor.ts";
import { cursorHome } from "./paths.ts";

export const namingModel = () => process.env.YM_NAMING_MODEL ?? "gpt-5.3-codex-low-fast";
const NAMING_TIMEOUT_MS = 20_000;
const MAX_PROMPT_CHARS = 2000;
const MAX_NAME_CHARS = 50;

const instruction = (prompt: string) =>
  "Reply with only a git branch name in kebab-case, at most 5 words, starting with a verb " +
  "like add/fix/update/refactor/remove. No quotes or explanation. Task:\n" +
  prompt.slice(0, MAX_PROMPT_CHARS);

/** Turns model output into a branch- and folder-safe name, or undefined if nothing usable remains. */
export function slugify(text: string): string | undefined {
  const line = text.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  const slug = line.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return undefined;
  if (slug.length <= MAX_NAME_CHARS) return slug;
  const cut = slug.slice(0, MAX_NAME_CHARS);
  const lastDash = cut.lastIndexOf("-");
  return lastDash > 0 ? cut.slice(0, lastDash) : cut;
}

/** Never throws: any failure or timeout returns undefined so the caller can fall back. */
export async function suggestWorktreeName(prompt: string): Promise<string | undefined> {
  try {
    // Runs outside the workspace so the agent has nothing to index or edit.
    const p = Bun.spawn(
      [AGENT_BIN(), "-p", "--trust", "--mode", "ask", "--model", namingModel(), "--output-format", "text", instruction(prompt)],
      { cwd: tmpdir(), stdin: "ignore", stdout: "pipe", stderr: "ignore" },
    );
    const timer = setTimeout(() => p.kill(), NAMING_TIMEOUT_MS);
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return code === 0 ? slugify(out) : undefined;
  } catch {
    return undefined;
  }
}

const git = (cwd: string, args: string[]) => Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });

/**
 * `agent --worktree <name>` reuses an existing worktree of that name, so pick one that is
 * neither a Cursor worktree folder for this repo nor an existing branch.
 */
export function uniqueWorktreeName(base: string, cwd: string): string {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top.exitCode !== 0) return base;
  const worktrees = join(cursorHome(), "worktrees", basename(top.stdout.toString().trim()));
  const taken = (name: string) =>
    existsSync(join(worktrees, name)) || git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]).exitCode === 0;
  if (!taken(base)) return base;
  for (let n = 2; n < 100; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}
