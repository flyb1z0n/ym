export const AGENT_BIN = () => process.env.YM_AGENT_BIN ?? "agent";

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

export interface LaunchOptions {
  chatId: string;
  addDirs?: string[];
  prompt?: string;
}

export function launchCommand(o: LaunchOptions): string[] {
  const cmd = [AGENT_BIN(), "--resume", o.chatId, "--trust"];
  for (const dir of o.addDirs ?? []) cmd.push("--add-dir", dir);
  // A leading dash would be parsed as a flag.
  if (o.prompt) cmd.push(o.prompt.startsWith("-") ? ` ${o.prompt}` : o.prompt);
  return cmd;
}
