import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cursorHome, installedHooksFile } from "./paths.ts";

export const HOOK_EVENTS = ["beforeSubmitPrompt", "preToolUse", "postToolUse", "stop", "sessionEnd"];

interface HookEntry {
  command: string;
  timeout?: number;
  [key: string]: unknown;
}

interface HooksFile {
  version: number;
  hooks: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

export const hooksPath = () => join(cursorHome(), "hooks.json");

const OURS_RE = /(?:^|\/)(?:ym|cli\.tsx) hook \w+$/;

export function hookCommand(self: string[], event: string): string {
  for (const part of self) {
    if (/\s/.test(part)) throw new Error(`Path contains whitespace, which hooks.json can't represent: ${part}`);
  }
  return [...self, "hook", event].join(" ");
}

function readInstalled(): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(installedHooksFile(), "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

function isOurs(entry: HookEntry, installed: Set<string>): boolean {
  return installed.has(entry.command) || OURS_RE.test(entry.command);
}

function readHooks(): HooksFile {
  const path = hooksPath();
  if (!existsSync(path)) return { version: 1, hooks: {} };
  let parsed: HooksFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as HooksFile;
  } catch (e) {
    throw new Error(`${path} is not valid JSON; fix it before running ym install (${(e as Error).message})`);
  }
  return { ...parsed, version: parsed.version ?? 1, hooks: parsed.hooks ?? {} };
}

function writeHooks(file: HooksFile): void {
  const path = hooksPath();
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.ym-bak`);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

function stripOurs(file: HooksFile, installed: Set<string>): HooksFile {
  const hooks: Record<string, HookEntry[]> = {};
  for (const [event, entries] of Object.entries(file.hooks)) {
    const kept = entries.filter((e) => !isOurs(e, installed));
    if (kept.length) hooks[event] = kept;
  }
  return { ...file, hooks };
}

export function install(self: string[]): string[] {
  const commands = HOOK_EVENTS.map((event) => hookCommand(self, event));
  const installed = readInstalled();
  const file = stripOurs(readHooks(), installed);
  HOOK_EVENTS.forEach((event, i) => (file.hooks[event] ??= []).push({ command: commands[i]!, timeout: 5 }));
  writeHooks(file);
  mkdirSync(dirname(installedHooksFile()), { recursive: true });
  writeFileSync(installedHooksFile(), JSON.stringify([...installed, ...commands]));
  return commands;
}

export function uninstall(): number {
  if (!existsSync(hooksPath())) return 0;
  const installed = readInstalled();
  const before = readHooks();
  const after = stripOurs(before, installed);
  const removed =
    Object.values(before.hooks).flat().length - Object.values(after.hooks).flat().length;
  if (removed) writeHooks(after);
  if (existsSync(installedHooksFile())) writeFileSync(installedHooksFile(), "[]");
  return removed;
}

export function isInstalled(self: string[]): boolean {
  let file: HooksFile;
  try {
    file = readHooks();
  } catch {
    return false;
  }
  return HOOK_EVENTS.every((event) =>
    (file.hooks[event] ?? []).some((e) => e.command === hookCommand(self, event)),
  );
}
