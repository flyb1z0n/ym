import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { Box, render, renderToString } from "ink";
import { createElement, useState } from "react";
import { LineInput } from "../src/ui/LineInput.tsx";
import { homedir } from "node:os";
import type { Session } from "../src/core/types.ts";
import { inputLineCount, promptHighlights, repeatInput, wrapStarts } from "../src/ui/promptText.ts";

describe("wrapStarts", () => {
  test("keeps short text on one line", () => {
    expect(wrapStarts("fix the bug", 20)).toEqual([0]);
  });

  test("breaks after the last space that fits", () => {
    expect(wrapStarts("fix the flaky login test", 10)).toEqual([0, 8, 14]);
  });

  test("hard-breaks words longer than the width", () => {
    expect(wrapStarts("abcdefghij", 4)).toEqual([0, 4, 8]);
  });

  test("breaks after every line break, including blank lines", () => {
    expect(wrapStarts("fix\n\nthe bug", 20)).toEqual([0, 4, 5]);
    expect(wrapStarts("fix the\nflaky login", 6)).toEqual([0, 4, 8, 14]);
  });

  test("counts the cursor cell past a full line", () => {
    expect(inputLineCount("abcd", 4)).toBe(2);
    expect(inputLineCount("abc", 4)).toBe(1);
  });
});

describe("promptHighlights", () => {
  test("colors folder tags and image markers differently", () => {
    expect(promptHighlights("@ym look at [Image #1] in @~/dev/app")).toEqual([
      { start: 0, end: 3, color: "cyan" },
      { start: 26, end: 36, color: "cyan" },
      { start: 12, end: 22, color: "magenta" },
    ]);
  });

  test("ignores @ inside words", () => {
    expect(promptHighlights("mail me@example.com")).toEqual([]);
  });
});

describe("repeatInput", () => {
  const session = (extra: Partial<Session> = {}): Session => ({
    id: "abcdef12",
    name: "s",
    cwd: `${homedir()}/dev/app`,
    addDirs: ["/tmp/lib"],
    chatId: "c",
    source: "ym",
    createdAt: 0,
    ...extra,
  });

  test("tags the session's folders before its saved prompt and keeps its images", () => {
    expect(repeatInput(session({ prompt: "fix\n[Image #1] this", images: ["/tmp/a.png"] }))).toEqual({
      text: "@~/dev/app @/tmp/lib fix\n[Image #1] this",
      images: ["/tmp/a.png"],
    });
  });

  test("uses the fallback without its image markers when no prompt was saved", () => {
    expect(repeatInput(session(), "[Image #1] fix this")).toEqual({ text: "@~/dev/app @/tmp/lib fix this", images: [] });
  });

  test("a context session tags its context folders and turns context mode back on", () => {
    const s = session({ cwd: `${homedir()}/dev`, contextFolders: [`${homedir()}/dev/app`, "/tmp/lib"], prompt: "fix" });
    expect(repeatInput(s)).toEqual({ text: "@~/dev/app @/tmp/lib fix", images: [], context: true });
  });

  test("returns nothing without a prompt", () => {
    expect(repeatInput(session())).toBeUndefined();
    expect(repeatInput(session(), "[Image #1]")).toBeUndefined();
  });
});

describe("LineInput", () => {
  test("wraps long values onto several lines", () => {
    const input = createElement(LineInput, {
      value: "fix the flaky login test",
      width: 10,
      maxLines: 8,
      onChange() {},
    });
    const lines = renderToString(createElement(Box, { width: 10 }, input)).split("\n").map((l) => l.trimEnd());
    expect(lines).toEqual(["fix the", "flaky", "login", "test"]);
  });

  test("scrolls to keep the cursor line within maxLines", () => {
    const input = createElement(LineInput, {
      value: "one two three four five",
      width: 5,
      maxLines: 2,
      onChange() {},
    });
    const lines = renderToString(createElement(Box, { width: 5 }, input)).split("\n").map((l) => l.trimEnd());
    expect(lines).toEqual(["four", "five"]);
  });

  test("shows line breaks as separate lines", () => {
    const input = createElement(LineInput, {
      value: "fix\n\nthe bug",
      width: 20,
      maxLines: 8,
      multiline: true,
      onChange() {},
    });
    const lines = renderToString(createElement(Box, { width: 20 }, input)).split("\n").map((l) => l.trimEnd());
    expect(lines).toEqual(["fix", "", "the bug"]);
  });

  async function typeInto(multiline: boolean, keys: string[]): Promise<string | undefined> {
    const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
    const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 40, rows: 10 });
    stdout.resume();
    let submitted: string | undefined;
    function Controlled() {
      const [value, setValue] = useState("");
      return createElement(LineInput, { value, onChange: setValue, onSubmit: (v) => (submitted = v), multiline, width: 30, maxLines: 4 });
    }
    const app = render(createElement(Controlled), { stdin: stdin as never, stdout: stdout as never, patchConsole: false });
    for (const k of keys) {
      stdin.write(k);
      await Bun.sleep(30);
    }
    app.unmount();
    return submitted;
  }

  test("Shift-Enter, Option-Enter, and Ctrl-J add line breaks; Enter submits", async () => {
    expect(await typeInto(true, ["ab", "\x1b[13;2u", "c", "\x1b\r", "d", "\n", "e", "\r"])).toBe("ab\nc\nd\ne");
  });

  test("single-line inputs submit on Shift-Enter and turn Ctrl-J into a space", async () => {
    expect(await typeInto(false, ["ab", "\n", "c", "\x1b[13;2u"])).toBe("ab c");
  });
});
