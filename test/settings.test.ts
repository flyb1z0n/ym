import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settingsFile } from "../src/core/paths.ts";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/core/settings.ts";

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
  test("worktrees and worktree naming default to enabled", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ useWorktrees: true, nameWorktrees: true });
  });

  test("settings round-trip through config.json", () => {
    saveSettings({ useWorktrees: false, nameWorktrees: false });

    expect(loadSettings()).toEqual({ useWorktrees: false, nameWorktrees: false });
    expect(JSON.parse(readFileSync(settingsFile(), "utf8"))).toEqual({ useWorktrees: false, nameWorktrees: false });
  });

  test("a config from before worktree naming keeps its value and gets the naming default", () => {
    writeFileSync(settingsFile(), JSON.stringify({ useWorktrees: false }));
    expect(loadSettings()).toEqual({ useWorktrees: false, nameWorktrees: true });
  });

  test("malformed and incomplete config falls back to defaults", () => {
    writeFileSync(settingsFile(), "not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);

    writeFileSync(settingsFile(), "{}");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
