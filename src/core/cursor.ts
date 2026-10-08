import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cursorHome } from "./paths.ts";

export const AGENT_BIN = () => process.env.YM_AGENT_BIN ?? "agent";
/** Model used for regular agent processing. Kept separate from worktree naming. */
export const processingModel = () => process.env.YM_PROCESSING_MODEL;

/** Display name of the CLI's default model, from ~/.cursor/cli-config.json. */
export function defaultModelName(): string | undefined {
  try {
    const config = JSON.parse(readFileSync(join(cursorHome(), "cli-config.json"), "utf8")) as {
      model?: { displayNameShort?: string; displayName?: string; modelId?: string };
    };
    return config.model?.displayNameShort ?? config.model?.displayName ?? config.model?.modelId;
  } catch {
    return undefined;
  }
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const hasAgent = () => Bun.which(AGENT_BIN()) !== null;

export async function createChat(cwd: string): Promise<string> {
  const p = Bun.spawn([AGENT_BIN(), "create-chat"], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`agent create-chat failed: ${err.trim() || out.trim() || code}`);
  const id = out.match(UUID_RE)?.[0];
  if (!id) throw new Error(`agent create-chat returned no chat id: ${out.trim()}`);
  return id;
}

/** The interactive CLI's prompt bar line, e.g. "→ Plan, search, build anything". */
export const PROMPT_BAR = /^\s*→ /m;

export interface LaunchOptions {
  chatId: string;
  addDirs?: string[];
  prompt?: string;
  worktree?: string;
  model?: string;
}

export function launchCommand(o: LaunchOptions): string[] {
  const cmd = [AGENT_BIN(), "--resume", o.chatId, "--trust"];
  if (o.model) cmd.push("--model", o.model);
  if (o.worktree) cmd.push("--worktree", o.worktree);
  for (const dir of o.addDirs ?? []) cmd.push("--add-dir", dir);
  // A leading dash would be parsed as a flag.
  if (o.prompt) cmd.push(o.prompt.startsWith("-") ? ` ${o.prompt}` : o.prompt);
  return cmd;
}
