import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOOK_EVENTS, hooksPath, hooksRegistered, install, isInstalled, uninstall } from "../src/core/install.ts";
import { hookShimFile } from "../src/core/paths.ts";

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
const shimCommand = (event: string) => `${hookShimFile()} ${event}`;

describe("install", () => {
  test("creates hooks.json when missing", () => {
    install(self);
    const file = read();
    expect(file.version).toBe(1);
    for (const e of HOOK_EVENTS) expect(file.hooks[e]).toEqual([{ command: shimCommand(e), timeout: 5 }]);
    expect(isInstalled(self)).toBe(true);
  });

  test("hooks call a shim that forwards to the installing build", async () => {
    install(["/opt/bun", "/src/it's here/cli.tsx"]);
    expect(statSync(hookShimFile()).mode & 0o777).toBe(0o755);
    const echo = join(dir, "echo.sh");
    writeFileSync(echo, '#!/bin/sh\necho "$@"\n', { mode: 0o755 });
    install([echo, "/src/it's here/cli.tsx"]);
    const out = Bun.spawnSync([hookShimFile(), "stop", "codex"]).stdout.toString();
    expect(out).toBe("/src/it's here/cli.tsx hook stop codex\n");
  });

  test("reinstalling from another build keeps hooks.json and only repoints the shim", () => {
    install(["/old/ym"]);
    const before = readFileSync(hooksPath(), "utf8");
    expect(isInstalled(self)).toBe(false);
    expect(hooksRegistered()).toBe(true);
    install(self);
    expect(readFileSync(hooksPath(), "utf8")).toBe(before);
    expect(isInstalled(self)).toBe(true);
  });

  test("preserves existing hooks, replaces direct commands from older installs, and is idempotent", () => {
    const existing = { version: 1, hooks: { stop: [{ command: "./hooks/mine.sh" }], afterFileEdit: [{ command: "fmt" }] } };
    const legacy: Record<string, { command: string; timeout?: number }[]> = Object.fromEntries(
      HOOK_EVENTS.map((e) => [e, [{ command: `/x/ym hook ${e}`, timeout: 5 }]]),
    );
    legacy.stop!.unshift(existing.hooks.stop[0]!);
    mkdirSync(process.env.YM_CURSOR_HOME!);
    writeFileSync(hooksPath(), JSON.stringify({ version: 1, hooks: { ...legacy, afterFileEdit: existing.hooks.afterFileEdit } }));

    install(self);
    install(self);
    const file = read();
    expect(file.hooks.stop).toEqual([{ command: "./hooks/mine.sh" }, { command: shimCommand("stop"), timeout: 5 }]);
    expect(file.hooks.afterFileEdit).toEqual([{ command: "fmt" }]);
    expect(Object.values(file.hooks).flat().filter((h: any) => h.command.startsWith("/x/"))).toEqual([]);
    expect(existsSync(`${hooksPath()}.ym-bak`)).toBe(true);
  });

  test("uninstall removes only ym entries and the shim", () => {
    install(self);
    const file = read();
    file.hooks.stop.push({ command: "./hooks/mine.sh" });
    writeFileSync(hooksPath(), JSON.stringify(file));
    expect(uninstall()).toBe(HOOK_EVENTS.length);
    expect(read().hooks).toEqual({ stop: [{ command: "./hooks/mine.sh" }] });
    expect(existsSync(hookShimFile())).toBe(false);
    expect(isInstalled(self)).toBe(false);
  });

  test("refuses invalid JSON and a shim path with spaces", () => {
    install(self);
    writeFileSync(hooksPath(), "{oops");
    expect(() => install(self)).toThrow(/not valid JSON/);
    process.env.YM_HOME = join(dir, "My ym");
    writeFileSync(hooksPath(), "{}");
    expect(() => install(self)).toThrow(/whitespace/);
  });
});
