import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAgent } from "./agents.ts";
import { settingsFile, ymHome } from "./paths.ts";
import type { Agent } from "./types.ts";

export interface Settings {
  useWorktrees: boolean;
  /** Ask a small model to name the worktree after the prompt instead of using the session id. */
  nameWorktrees: boolean;
  /** Ask a small model for a one-sentence session name instead of showing the prompt's first line. */
  nameSessions: boolean;
  /** Greet the user as "Main" instead of "Master". */
  callMeMain: boolean;
  /** Agent for prompts without a `#agent` tag. */
  defaultAgent: Agent;
  /** Launch Cursor with `--force` so it runs commands without asking. */
  cursorAutoRun: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  useWorktrees: true,
  nameWorktrees: true,
  nameSessions: true,
  callMeMain: false,
  defaultAgent: "cursor",
  cursorAutoRun: false,
};

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
    return {
      useWorktrees: flag(value.useWorktrees, DEFAULT_SETTINGS.useWorktrees),
      nameWorktrees: flag(value.nameWorktrees, DEFAULT_SETTINGS.nameWorktrees),
      nameSessions: flag(value.nameSessions, DEFAULT_SETTINGS.nameSessions),
      callMeMain: flag(value.callMeMain, DEFAULT_SETTINGS.callMeMain),
      defaultAgent: isAgent(value.defaultAgent) ? value.defaultAgent : DEFAULT_SETTINGS.defaultAgent,
      cursorAutoRun: flag(value.cursorAutoRun, DEFAULT_SETTINGS.cursorAutoRun),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(ymHome(), { recursive: true });
  const path = settingsFile();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2));
  renameSync(tmp, path);
}
