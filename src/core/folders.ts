import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { expandHome } from "./paths.ts";

/** Roots whose subfolders are offered for @tags (YM_ROOTS, colon-separated; default ~/dev). */
export function folderRoots(): string[] {
  const raw = process.env.YM_ROOTS ?? join(homedir(), "dev");
  return raw.split(":").filter(Boolean).map(expandHome).filter((p) => existsSync(p));
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}

/** Children of each root, plus grandchildren under folders that aren't repos themselves. */
export function rootFolders(roots = folderRoots()): string[] {
  const out: string[] = [];
  for (const root of roots) {
    for (const child of subdirs(root)) {
      out.push(child);
      if (!existsSync(join(child, ".git"))) out.push(...subdirs(child));
    }
  }
  return out;
}

/** Ordered, de-duplicated candidates: recent session folders first, then chats, then roots. */
export function buildFolderIndex(...groups: string[][]): string[] {
  return [...new Set(groups.flat())];
}

export interface TagToken {
  start: number;
  query: string;
}

/** The @tag being typed at the end of the input, if any. */
export function trailingTag(text: string): TagToken | undefined {
  const m = text.match(/(?:^|\s)@(\S*)$/);
  if (!m || m.index === undefined) return undefined;
  return { start: m.index + (m[0].startsWith("@") ? 0 : 1), query: m[1] ?? "" };
}

const looksLikePath = (q: string) => q.startsWith("~") || q.startsWith("/") || q.startsWith(".");

export function suggestFolders(query: string, index: string[], limit = 6): string[] {
  if (looksLikePath(query)) {
    const expanded = expandHome(query);
    const dir = expanded.endsWith("/") ? expanded : dirname(expanded);
    const prefix = expanded.endsWith("/") ? "" : basename(expanded);
    return subdirs(dir)
      .filter((p) => basename(p).toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, limit);
  }
  const q = query.toLowerCase();
  const byName = index.filter((p) => basename(p).toLowerCase().startsWith(q));
  const tail = (p: string) => p.split("/").slice(-3).join("/").toLowerCase();
  const byPath = index.filter((p) => tail(p).includes(q));
  return [...new Set([...byName, ...byPath])].slice(0, limit);
}

export interface ParsedPrompt {
  prompt: string;
  folders: string[];
  errors: string[];
}

function resolveTag(tag: string, index: string[]): string | undefined {
  const candidates = looksLikePath(tag) || tag.includes("/")
    ? [expandHome(tag)]
    : index.filter((p) => basename(p) === tag);
  for (const c of candidates) {
    try {
      if (statSync(c).isDirectory()) return realpathSync(c);
    } catch {
      // Not a directory; try the next candidate.
    }
  }
  return undefined;
}

/** Splits "@a @b do X" into folders [a, b] and prompt "do X". */
export function parsePrompt(text: string, index: string[]): ParsedPrompt {
  const folders: string[] = [];
  const errors: string[] = [];
  const prompt = text
    .replace(/(^|\s)@(\S+)/g, (_m, lead: string, tag: string) => {
      const dir = resolveTag(tag, index);
      if (dir) folders.push(dir);
      else errors.push(`Unknown folder @${tag}`);
      return lead;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { prompt, folders: [...new Set(folders)], errors };
}
