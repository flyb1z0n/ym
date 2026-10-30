import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { suggestSessionName, toTitle } from "../src/core/naming.ts";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-naming-")));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env.YM_AGENT_BIN;
});

function fakeAgent(name: string, script: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/bash\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("toTitle", () => {
  test("keeps a clean sentence", () => {
    expect(toTitle("Fix the login redirect loop\n")).toBe("Fix the login redirect loop");
  });

  test("drops quotes, markdown, a label, the trailing period and extra spaces", () => {
    expect(toTitle('**"Add  dark mode to settings."**')).toBe("Add dark mode to settings");
    expect(toTitle("Title: `Refactor the store`")).toBe("Refactor the store");
  });

  test("uses the last non-empty line when the model adds a preamble", () => {
    expect(toTitle("Here is a title:\n\nSpeed up the importer\n")).toBe("Speed up the importer");
  });

  test("cuts long titles at a word boundary with an ellipsis", () => {
    const title = toTitle("Add a very long session title that keeps on going and going well past the limit")!;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toBe("Add a very long session title that keeps on going and…");
  });

  test("returns undefined when nothing usable is left", () => {
    expect(toTitle("")).toBeUndefined();
    expect(toTitle('"..."')).toBeUndefined();
  });
});

describe("suggestSessionName", () => {
  test("asks for a one-sentence title and tidies the answer", async () => {
    process.env.YM_AGENT_BIN = fakeAgent("title.sh", 'echo "\\"Fix the bug.\\""; echo "${!#}" > "$(dirname "$0")/title-prompt"');
    expect(await suggestSessionName("the login page crashes")).toBe("Fix the bug");
    const asked = await Bun.file(join(dir, "title-prompt")).text();
    expect(asked).toContain("one-sentence title");
    expect(asked).toContain("the login page crashes");
  });

  test("runs the agent with a throwaway config dir so its model never becomes the CLI default", async () => {
    process.env.YM_AGENT_BIN = fakeAgent(
      "config.sh",
      'echo "$CURSOR_CONFIG_DIR" > "$(dirname "$0")/config-dir"; [ -d "$CURSOR_CONFIG_DIR" ] && echo "Add a thing"',
    );
    expect(await suggestSessionName("anything")).toBe("Add a thing");
    const configDir = (await Bun.file(join(dir, "config-dir")).text()).trim();
    expect(configDir).not.toBe("");
    expect(configDir).not.toBe(join(homedir(), ".cursor"));
    expect(existsSync(configDir)).toBe(false);
  });

  test("returns undefined when the agent fails or is missing", async () => {
    process.env.YM_AGENT_BIN = fakeAgent("title-fail.sh", "echo 'Model not found' >&2; exit 1");
    expect(await suggestSessionName("anything")).toBeUndefined();

    process.env.YM_AGENT_BIN = join(dir, "does-not-exist");
    expect(await suggestSessionName("anything")).toBeUndefined();
  });
});
