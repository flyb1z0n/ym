import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { settingsFile, ymHome } from "./paths.ts";

export interface Settings {
  useWorktrees: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  useWorktrees: true,
};

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
    return {
      useWorktrees:
        typeof value.useWorktrees === "boolean" ? value.useWorktrees : DEFAULT_SETTINGS.useWorktrees,
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
