import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { codexHome } from "./paths.ts";

export const CODEX_BIN = () => process.env.YM_CODEX_BIN ?? "codex";
export const codexModel = () => process.env.YM_CODEX_MODEL;

export const hasCodex = () => Bun.which(CODEX_BIN()) !== null;

export interface CodexLaunchOptions {
  /** Folder Codex works in: the session's workspace, or its ym worktree. */
  cwd: string;
  /** Resumes this Codex session instead of starting a new one. */
  chatId?: string;
  addDirs?: string[];
  prompt?: string;
  images?: string[];
  model?: string;
}

export function codexCommand(o: CodexLaunchOptions): string[] {
  const cmd = [CODEX_BIN()];
  if (o.chatId) cmd.push("resume", o.chatId);
  // No `-c` folder trust here: any `-c` makes Codex skip its shared background server. ym's
  // worktrees are trusted once in config.toml by `ym install` instead.
  cmd.push("-C", o.cwd);
  if (o.model) cmd.push("-m", o.model);
  for (const dir of o.addDirs ?? []) cmd.push("--add-dir", dir);
  for (const image of o.images ?? []) cmd.push(`--image=${image}`);
  // `--` keeps a prompt that starts with a dash or names a subcommand ("review") a prompt.
  if (o.prompt) cmd.push("--", o.prompt);
  return cmd;
}

export interface CodexSession {
  chatId: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  /** Interactive sessions only; `codex exec` runs can't be resumed in the TUI. */
  interactive: boolean;
}

const HEAD_BYTES = 16 * 1024;
const ROLLOUT_RE = /^rollout-.*\.jsonl$/;

function readHead(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    return buf.toString("utf8", 0, readSync(fd, buf, 0, HEAD_BYTES, 0));
  } catch {
    return "";
  } finally {
    closeSync(fd);
  }
}

/** A string field from the session_meta line, which can be too long to read whole. */
function metaField(head: string, field: string): string | undefined {
  const m = head.match(new RegExp(`"${field}":("(?:[^"\\\\]|\\\\.)*")`));
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]!) as string;
  } catch {
    return undefined;
  }
}

function rolloutFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return rolloutFiles(path);
    return ROLLOUT_RE.test(e.name) ? [path] : [];
  });
}

/** Sessions recorded under ~/.codex/sessions, newest first. */
export function scanCodexSessions(home = codexHome()): CodexSession[] {
  const out: CodexSession[] = [];
  for (const path of rolloutFiles(join(home, "sessions"))) {
    const head = readHead(path);
    const chatId = metaField(head, "session_id") ?? metaField(head, "id");
    const cwd = metaField(head, "cwd");
    if (!chatId || !cwd) continue;
    const created = Date.parse(metaField(head, "timestamp") ?? "");
    let updatedAt = 0;
    try {
      updatedAt = statSync(path).mtimeMs;
    } catch {
      continue;
    }
    out.push({
      chatId,
      cwd,
      createdAt: Number.isNaN(created) ? updatedAt : created,
      updatedAt,
      interactive: metaField(head, "originator") !== "codex_exec" && metaField(head, "source") !== "exec",
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Thread names Codex keeps in session_index.jsonl, by session id. */
export function codexTitles(home = codexHome()): Map<string, string> {
  const titles = new Map<string, string>();
  const path = join(home, "session_index.jsonl");
  if (!existsSync(path)) return titles;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    try {
      const entry = JSON.parse(line) as { id?: string; thread_name?: string };
      if (entry.id && entry.thread_name) titles.set(entry.id, entry.thread_name);
    } catch {
      // Skip blank or partial lines.
    }
  }
  return titles;
}

/** The Codex session started in `cwd` at or after `since`, for sessions whose SessionStart hook never ran. */
export function findCodexSession(cwd: string, since: number, home = codexHome()): string | undefined {
  // Codex records the canonical path (e.g. /private/var for /var).
  const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
  const target = real(cwd);
  return scanCodexSessions(home)
    .filter((s) => s.interactive && s.createdAt >= since && real(s.cwd) === target)
    .sort((a, b) => a.createdAt - b.createdAt)[0]?.chatId;
}
