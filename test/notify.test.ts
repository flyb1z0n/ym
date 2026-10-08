import { describe, expect, test } from "bun:test";
import { osc9Passthrough, supportsOsc9 } from "../src/core/notify.ts";

describe("supportsOsc9", () => {
  test("matches terminals that post their own notifications", () => {
    expect(supportsOsc9("iTerm2 3.7.3")).toBe(true);
    expect(supportsOsc9("ghostty 1.2.0")).toBe(true);
  });

  test("rejects unknown and nested terminals", () => {
    expect(supportsOsc9("")).toBe(false);
    expect(supportsOsc9("tmux 3.8")).toBe(false);
  });
});

describe("osc9Passthrough", () => {
  test("wraps OSC 9 in tmux passthrough with escapes doubled", () => {
    expect(osc9Passthrough("ym: a: ready")).toBe("\x1bPtmux;\x1b\x1b]9;ym: a: ready\x07\x1b\\");
  });

  test("strips control characters from the text", () => {
    expect(osc9Passthrough("a\x07b\x1bc\nd")).toBe("\x1bPtmux;\x1b\x1b]9;a b c d\x07\x1b\\");
  });
});
