import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { codexTitles, scanCodexSessions } from "./codex.ts";
import { codexHome, cursorHome } from "./paths.ts";
import type { Agent } from "./types.ts";

export interface Chat {
  agent: Agent;
  chatId: string;
  cwd: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface ChatMeta {
  cwd?: string;
  title?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  hasConversation?: boolean;
}

function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Cursor's store.db keeps agent metadata as hex-encoded JSON under meta key '0'. */
export function titleFromStore(dbPath: string): string | undefined {
  if (!existsSync(dbPath)) return undefined;
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.query<{ value: string }, []>("select value from meta where key = '0'").get();
    if (!row) return undefined;
    const meta = JSON.parse(Buffer.from(row.value, "hex").toString("utf8")) as { name?: string };
    return meta.name || undefined;
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

function firstPrompt(dir: string): string | undefined {
  const history = readJson<unknown>(join(dir, "prompt_history.json"));
  return Array.isArray(history) && typeof history[0] === "string" ? history[0] : undefined;
}

export function scanChats(root = join(cursorHome(), "chats")): Chat[] {
  if (!existsSync(root)) return [];
  const chats: Chat[] = [];
  for (const hash of readdirSync(root)) {
    const hashDir = join(root, hash);
    let entries: string[];
    try {
      entries = readdirSync(hashDir);
    } catch {
      continue;
    }
    for (const chatId of entries) {
      const dir = join(hashDir, chatId);
      const meta = readJson<ChatMeta>(join(dir, "meta.json"));
      if (!meta?.cwd || meta.hasConversation === false) continue;
      const title =
        meta.title || titleFromStore(join(dir, "store.db")) || firstPrompt(dir) || "(untitled)";
      chats.push({
        agent: "cursor",
        chatId,
        cwd: meta.cwd,
        title,
        createdAt: meta.createdAtMs ?? 0,
        updatedAt: meta.updatedAtMs ?? meta.createdAtMs ?? 0,
      });
    }
  }
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Interactive Codex sessions, titled by Codex's thread names. */
export function scanCodexChats(home = codexHome()): Chat[] {
  const titles = codexTitles(home);
  return scanCodexSessions(home)
    .filter((s) => s.interactive)
    .map(({ chatId, cwd, createdAt, updatedAt }) => ({
      agent: "codex" as const,
      chatId,
      cwd,
      title: titles.get(chatId) ?? "(untitled)",
      createdAt,
      updatedAt,
    }));
}

/** Every importable chat across agents, newest first. */
export const scanAllChats = (): Chat[] =>
  [...scanChats(), ...scanCodexChats()].sort((a, b) => b.updatedAt - a.updatedAt);
