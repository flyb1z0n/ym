import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { settingsFile, ymHome } from "./paths.ts";

export interface Settings {
  useWorktrees: boolean;
  /** Ask a small model to name the worktree after the prompt instead of using the session id. */
  nameWorktrees: boolean;
  /** Greet the user as "Main" instead of "Master". */
  callMeMain: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  useWorktrees: true,
  nameWorktrees: true,
  callMeMain: false,
};

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
    return {
      useWorktrees: flag(value.useWorktrees, DEFAULT_SETTINGS.useWorktrees),
      nameWorktrees: flag(value.nameWorktrees, DEFAULT_SETTINGS.nameWorktrees),
      callMeMain: flag(value.callMeMain, DEFAULT_SETTINGS.callMeMain),
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
