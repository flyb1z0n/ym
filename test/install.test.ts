import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_EVENTS, hooksPath, install, isInstalled, uninstall } from "../src/core/install.ts";

const self = ["/opt/bin/ym"];
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ym-install-"));
  process.env.YM_HOME = join(dir, "ym");
  process.env.YM_CURSOR_HOME = join(dir, "cursor");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.YM_HOME;
  delete process.env.YM_CURSOR_HOME;
});

const read = () => JSON.parse(readFileSync(hooksPath(), "utf8"));

describe("install", () => {
  test("creates hooks.json when missing", () => {
    install(self);
    const file = read();
    expect(file.version).toBe(1);
    for (const e of HOOK_EVENTS) expect(file.hooks[e]).toEqual([{ command: `/opt/bin/ym hook ${e}`, timeout: 5 }]);
    expect(isInstalled(self)).toBe(true);
  });

  test("preserves existing hooks, backs up, and is idempotent", () => {
    const existing = { version: 1, hooks: { stop: [{ command: "./hooks/mine.sh" }], afterFileEdit: [{ command: "fmt" }] } };
    install(["/x"]); // stale install at another path
    const stale = read();
    stale.hooks.stop.unshift(existing.hooks.stop[0]);
    stale.hooks.afterFileEdit = existing.hooks.afterFileEdit;
    writeFileSync(hooksPath(), JSON.stringify(stale));

    install(self);
    install(self);
    const file = read();
    expect(file.hooks.stop).toEqual([{ command: "./hooks/mine.sh" }, { command: "/opt/bin/ym hook stop", timeout: 5 }]);
    expect(file.hooks.afterFileEdit).toEqual([{ command: "fmt" }]);
    expect(Object.values(file.hooks).flat().filter((h: any) => h.command.startsWith("/x "))).toEqual([]);
    expect(existsSync(`${hooksPath()}.ym-bak`)).toBe(true);
  });

  test("uninstall removes only ym entries", () => {
    install(self);
    const file = read();
    file.hooks.stop.push({ command: "./hooks/mine.sh" });
    writeFileSync(hooksPath(), JSON.stringify(file));
    expect(uninstall()).toBe(HOOK_EVENTS.length);
    expect(read().hooks).toEqual({ stop: [{ command: "./hooks/mine.sh" }] });
    expect(isInstalled(self)).toBe(false);
  });

  test("refuses invalid JSON and paths with spaces", () => {
    install(self);
    writeFileSync(hooksPath(), "{oops");
    expect(() => install(self)).toThrow(/not valid JSON/);
    expect(() => install(["/My Apps/ym"])).toThrow(/whitespace/);
  });
});
