import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CODEX_EVENTS } from "./hook.ts";
import { codexHome, cursorHome, installedHooksFile, ymWorktreesDir } from "./paths.ts";

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

// Codex: same idea, in ~/.codex/hooks.json's nested format.

export const CODEX_HOOK_EVENTS = Object.keys(CODEX_EVENTS);
/** Codex caps SessionEnd hooks at 3 s. */
const CODEX_TIMEOUT: Record<string, number> = { SessionEnd: 3 };

interface CodexHookGroup {
  matcher?: string;
  hooks?: { type?: string; command?: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

interface CodexHooksFile {
  hooks: Record<string, CodexHookGroup[]>;
  [key: string]: unknown;
}

export const codexHooksPath = () => join(codexHome(), "hooks.json");

const CODEX_OURS_RE = /(?:^|\/)(?:ym|cli\.tsx) hook \w+ codex$/;

export const codexHookCommand = (self: string[], event: string) => `${hookCommand(self, event)} codex`;

const isOursCodex = (command: string | undefined, installed: Set<string>) =>
  !!command && (installed.has(command) || CODEX_OURS_RE.test(command));

function readCodexHooks(): CodexHooksFile {
  const path = codexHooksPath();
  if (!existsSync(path)) return { hooks: {} };
  let parsed: CodexHooksFile;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as CodexHooksFile;
  } catch (e) {
    throw new Error(`${path} is not valid JSON; fix it before running ym install (${(e as Error).message})`);
  }
  return { ...parsed, hooks: parsed.hooks ?? {} };
}

function writeCodexHooks(file: CodexHooksFile): void {
  const path = codexHooksPath();
  if (existsSync(path)) copyFileSync(path, `${path}.ym-bak`);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

function stripOursCodex(file: CodexHooksFile, installed: Set<string>): CodexHooksFile {
  const hooks: Record<string, CodexHookGroup[]> = {};
  for (const [event, groups] of Object.entries(file.hooks)) {
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOursCodex(h.command, installed)) }))
      .filter((g, i) => g.hooks.length || (groups[i]!.hooks ?? []).length === 0);
    if (kept.length) hooks[event] = kept;
  }
  return { ...file, hooks };
}

export const codexConfigPath = () => join(codexHome(), "config.toml");

/** Codex trusts subfolders of a trusted folder, so one entry covers every worktree ym creates. */
function worktreesTrust(): string {
  mkdirSync(ymWorktreesDir(), { recursive: true });
  return `[projects.${JSON.stringify(realpathSync(ymWorktreesDir()))}]\ntrust_level = "trusted"\n`;
}

/** Adds the trust entry unless the user already has one for that folder (whatever its level). */
function trustYmWorktrees(): void {
  const entry = worktreesTrust();
  const path = codexConfigPath();
  const config = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (config.includes(entry.split("\n")[0]!)) return;
  if (config) copyFileSync(path, `${path}.ym-bak`);
  writeFileSync(path, `${config}${config && !config.endsWith("\n") ? "\n" : ""}\n${entry}`);
}

function untrustYmWorktrees(): void {
  const path = codexConfigPath();
  if (!existsSync(path) || !existsSync(ymWorktreesDir())) return;
  const config = readFileSync(path, "utf8");
  const next = config.replace(`\n${worktreesTrust()}`, "");
  if (next !== config) {
    copyFileSync(path, `${path}.ym-bak`);
    writeFileSync(path, next);
  }
}

/** Undefined when Codex isn't set up on this machine (no ~/.codex). */
export function installCodex(self: string[]): string[] | undefined {
  if (!existsSync(codexHome())) return undefined;
  trustYmWorktrees();
  const commands = CODEX_HOOK_EVENTS.map((event) => codexHookCommand(self, event));
  const installed = readInstalled();
  const file = stripOursCodex(readCodexHooks(), installed);
  CODEX_HOOK_EVENTS.forEach((event, i) =>
    (file.hooks[event] ??= []).push({
      hooks: [{ type: "command", command: commands[i]!, timeout: CODEX_TIMEOUT[event] ?? 5 }],
    }),
  );
  writeCodexHooks(file);
  mkdirSync(dirname(installedHooksFile()), { recursive: true });
  writeFileSync(installedHooksFile(), JSON.stringify([...installed, ...commands]));
  return commands;
}

export function uninstallCodex(): number {
  untrustYmWorktrees();
  if (!existsSync(codexHooksPath())) return 0;
  const count = (f: CodexHooksFile) => Object.values(f.hooks).flat().flatMap((g) => g.hooks ?? []).length;
  const before = readCodexHooks();
  const after = stripOursCodex(before, readInstalled());
  const removed = count(before) - count(after);
  if (removed) writeCodexHooks(after);
  return removed;
}

export function isCodexInstalled(self: string[]): boolean {
  let file: CodexHooksFile;
  try {
    file = readCodexHooks();
  } catch {
    return false;
  }
  return CODEX_HOOK_EVENTS.every((event) =>
    (file.hooks[event] ?? []).some((g) => (g.hooks ?? []).some((h) => h.command === codexHookCommand(self, event))),
  );
}
