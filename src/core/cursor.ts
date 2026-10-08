import { basename, join } from "node:path";
import { cursorHome } from "./paths.ts";

export const AGENT_BIN = () => process.env.YM_AGENT_BIN ?? "agent";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const hasAgent = () => Bun.which(AGENT_BIN()) !== null;

async function run(cmd: string[], cwd: string): Promise<string> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed: ${err.trim() || out.trim() || code}`);
  return out;
}

export async function createChat(cwd: string): Promise<string> {
  const out = await run([AGENT_BIN(), "create-chat"], cwd);
  const id = out.match(UUID_RE)?.[0];
  if (!id) throw new Error(`agent create-chat returned no chat id: ${out.trim()}`);
  return id;
}

export interface Model {
  id: string;
  label: string;
}

export async function listModels(cwd: string): Promise<Model[]> {
  const out = await run([AGENT_BIN(), "models"], cwd);
  return parseModels(out);
}

export function parseModels(out: string): Model[] {
  const models: Model[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*([\w.\-[\]=,]+) - (.+)$/);
    if (m?.[1] && m[2]) models.push({ id: m[1], label: m[2].trim() });
  }
  return models;
}

export interface LaunchOptions {
  chatId: string;
  model?: string;
  worktree?: string;
  prompt?: string;
}

export function launchCommand(o: LaunchOptions): string[] {
  const cmd = [AGENT_BIN(), "--resume", o.chatId, "--trust"];
  if (o.model) cmd.push("--model", o.model);
  if (o.worktree) cmd.push("--worktree", o.worktree);
  // A leading dash would be parsed as a flag.
  if (o.prompt) cmd.push(o.prompt.startsWith("-") ? ` ${o.prompt}` : o.prompt);
  return cmd;
}

export const resumeCommand = (chatId: string) => launchCommand({ chatId });

/** Where `agent --worktree <name>` places the checkout for the repo containing `cwd`. */
export function worktreePath(cwd: string, name: string): string | undefined {
  const p = Bun.spawnSync(["git", "-C", cwd, "rev-parse", "--show-toplevel"]);
  if (p.exitCode !== 0) return undefined;
  const top = p.stdout.toString().trim();
  return join(cursorHome(), "worktrees", basename(top), name);
}
