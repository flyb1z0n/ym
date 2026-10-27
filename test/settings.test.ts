import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settingsFile } from "../src/core/paths.ts";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/core/settings.ts";
import { greeting } from "../src/ui/Header.tsx";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ym-settings-"));
  process.env.YM_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.YM_HOME;
});

describe("settings", () => {
  test("worktrees, worktree naming and session naming default to enabled, Cursor is the default agent, and auto-run is off", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      useWorktrees: true,
      nameWorktrees: true,
      nameSessions: true,
      callMeMain: false,
      defaultAgent: "cursor",
      cursorAutoRun: false,
    });
  });

  test("settings round-trip through config.json", () => {
    const settings = {
      useWorktrees: false,
      nameWorktrees: false,
      nameSessions: false,
      callMeMain: true,
      defaultAgent: "codex" as const,
      cursorAutoRun: true,
    };
    saveSettings(settings);

    expect(loadSettings()).toEqual(settings);
    expect(JSON.parse(readFileSync(settingsFile(), "utf8"))).toEqual(settings);
  });

  test("a config from before worktree naming keeps its value and gets the naming default", () => {
    writeFileSync(settingsFile(), JSON.stringify({ useWorktrees: false }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, useWorktrees: false });
  });

  test("an unknown default agent falls back to Cursor", () => {
    writeFileSync(settingsFile(), JSON.stringify({ defaultAgent: "claude" }));
    expect(loadSettings().defaultAgent).toBe("cursor");
  });

  test("malformed and incomplete config falls back to defaults", () => {
    writeFileSync(settingsFile(), "not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);

    writeFileSync(settingsFile(), "{}");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("the header greets Master by default and Main when asked", () => {
    expect(greeting({ callMeMain: false })).toBe("Yes, Master!");
    expect(greeting({ callMeMain: true })).toBe("Yes, Main!");
  });
});
