import { describe, expect, test } from "bun:test";
import { Box, renderToString } from "ink";
import { createElement } from "react";
import { LineInput } from "../src/ui/LineInput.tsx";
import { inputLineCount, promptHighlights, wrapStarts } from "../src/ui/promptText.ts";

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
});
