import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextAgent } from "../src/core/agents.ts";
import { settingsFile } from "../src/core/paths.ts";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  toggleAgent,
  type Settings,
} from "../src/core/settings.ts";
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
  test("session naming defaults to enabled, Cursor is the default agent, every agent is on, and auto-run is off", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      nameSessions: true,
      callMeMain: false,
      defaultAgent: "cursor",
      enabledAgents: ["cursor", "codex"],
      cursorAutoRun: false,
    });
  });

  test("settings round-trip through config.json", () => {
    const settings: Settings = {
      nameSessions: false,
      callMeMain: true,
      defaultAgent: "codex",
      enabledAgents: ["codex"],
      cursorAutoRun: true,
      devDir: "/Users/me/dev",
    };
    saveSettings(settings);

    expect(loadSettings()).toEqual(settings);
    expect(JSON.parse(readFileSync(settingsFile(), "utf8"))).toEqual(settings);
  });

  test("an older config keeps its values, gets the new defaults, and drops the old worktree and context mode settings", () => {
    writeFileSync(
      settingsFile(),
      JSON.stringify({ useWorktrees: false, nameWorktrees: false, contextByDefault: false, nameSessions: false }),
    );
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, nameSessions: false });
  });

  test("the dev directory is unset by default, round-trips, and drops non-string values", () => {
    expect(loadSettings().devDir).toBeUndefined();
    saveSettings({ ...DEFAULT_SETTINGS, devDir: "/Users/me/dev" });
    expect(loadSettings().devDir).toBe("/Users/me/dev");

    writeFileSync(settingsFile(), JSON.stringify({ devDir: 42 }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("an unknown default agent falls back to Cursor", () => {
    writeFileSync(settingsFile(), JSON.stringify({ defaultAgent: "claude" }));
    expect(loadSettings().defaultAgent).toBe("cursor");
  });

  test("enabled agents drop unknown names, keep the agent order, and fall back to all when none are left", () => {
    writeFileSync(settingsFile(), JSON.stringify({ enabledAgents: ["claude", "codex", "cursor", "codex"] }));
    expect(loadSettings().enabledAgents).toEqual(["cursor", "codex"]);

    writeFileSync(settingsFile(), JSON.stringify({ enabledAgents: ["claude"] }));
    expect(loadSettings().enabledAgents).toEqual(["cursor", "codex"]);

    writeFileSync(settingsFile(), JSON.stringify({ enabledAgents: "codex" }));
    expect(loadSettings().enabledAgents).toEqual(["cursor", "codex"]);
  });

  test("a default agent that's turned off moves to the first enabled agent", () => {
    writeFileSync(settingsFile(), JSON.stringify({ defaultAgent: "cursor", enabledAgents: ["codex"] }));
    expect(loadSettings()).toMatchObject({ defaultAgent: "codex", enabledAgents: ["codex"] });
  });

  test("turning agents off keeps at least one on and moves the default off a disabled agent", () => {
    const codexOff = toggleAgent(DEFAULT_SETTINGS, "codex");
    expect(codexOff).toMatchObject({ enabledAgents: ["cursor"], defaultAgent: "cursor" });
    expect(toggleAgent(codexOff, "cursor")).toBe(codexOff);
    expect(toggleAgent(codexOff, "codex")).toMatchObject({ enabledAgents: ["cursor", "codex"], defaultAgent: "cursor" });
    expect(toggleAgent(DEFAULT_SETTINGS, "cursor")).toMatchObject({ enabledAgents: ["codex"], defaultAgent: "codex" });
  });

  test("Shift-Tab cycles only through the enabled agents", () => {
    expect(nextAgent("cursor", ["cursor", "codex"])).toBe("codex");
    expect(nextAgent("codex", ["cursor", "codex"])).toBe("cursor");
    expect(nextAgent("cursor", ["cursor"])).toBe("cursor");
    expect(nextAgent("cursor", ["codex"])).toBe("codex");
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
