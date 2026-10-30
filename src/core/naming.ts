import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_BIN } from "./cursor.ts";

export const namingModel = () => process.env.YM_NAMING_MODEL ?? "gpt-5.3-codex-low-fast";
const NAMING_TIMEOUT_MS = 20_000;
const MAX_PROMPT_CHARS = 2000;
const MAX_TITLE_CHARS = 60;

const titleInstruction = (prompt: string) =>
  "Reply with only a one-sentence title for this coding task, at most 8 words, in sentence case. " +
  "No quotes, markdown, trailing period or explanation. Task:\n" +
  prompt.slice(0, MAX_PROMPT_CHARS);

const lastLine = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";

/** Turns model output into a one-line session title, or undefined if nothing usable remains. */
export function toTitle(text: string): string | undefined {
  const title = lastLine(text)
    .replace(/^(title|name)\s*:\s*/i, "")
    .replace(/^["'`*_\s]+|["'`*_\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
  if (!/[\p{L}\p{N}]/u.test(title)) return undefined;
  if (title.length <= MAX_TITLE_CHARS) return title;
  const cut = title.slice(0, MAX_TITLE_CHARS - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Never throws: any failure or timeout returns undefined so the caller can keep the prompt-based name. */
export async function suggestSessionName(prompt: string): Promise<string | undefined> {
  const out = await askNamingModel(titleInstruction(prompt));
  return out === undefined ? undefined : toTitle(out);
}

async function askNamingModel(instruction: string): Promise<string | undefined> {
  // `agent --model` saves the model as the CLI's default in cli-config.json, which would make
  // the session itself start on the naming model, so the naming run gets a throwaway config dir.
  const configDir = mkdtempSync(join(tmpdir(), "ym-naming-"));
  try {
    // Runs outside the workspace so the agent has nothing to index or edit.
    const p = Bun.spawn(
      [AGENT_BIN(), "-p", "--trust", "--mode", "ask", "--model", namingModel(), "--output-format", "text", instruction],
      {
        cwd: tmpdir(),
        env: { ...process.env, CURSOR_CONFIG_DIR: configDir },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    const timer = setTimeout(() => p.kill(), NAMING_TIMEOUT_MS);
    const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    clearTimeout(timer);
    return code === 0 ? out : undefined;
  } catch {
    return undefined;
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}
