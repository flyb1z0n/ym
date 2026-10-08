import { describe, expect, test } from "bun:test";
import { applyEvents, deriveStatus, initialState, STALE_MS } from "../src/core/status.ts";
import type { HookEvent } from "../src/core/types.ts";

const alive = { paneId: "%1", dead: false, shown: false };
const dead = { paneId: "%1", dead: true, shown: false };
const ym = { source: "ym" as const };

// Event order observed in the spike against Cursor CLI 2026.10.01.
const turn = (t: number, stopStatus = "completed"): HookEvent[] => [
  { ts: t, event: "beforeSubmitPrompt" },
  { ts: t + 1, event: "preToolUse", tool: "Shell" },
  { ts: t + 2, event: "postToolUse", tool: "Shell" },
  { ts: t + 3, event: "stop", stopStatus },
];

const statusAfter = (events: HookEvent[], window = alive, now = 10) =>
  deriveStatus(ym, applyEvents(initialState(), events), window, now);

describe("status", () => {
  test("launch with prompt is working, without prompt is your turn", () => {
    expect(statusAfter([{ ts: 1, event: "ymLaunch", withPrompt: true }])).toBe("working");
    expect(statusAfter([{ ts: 1, event: "ymLaunch", withPrompt: false }])).toBe("your_turn");
  });

  test("a full turn ends on your turn", () => {
    expect(statusAfter(turn(1))).toBe("your_turn");
  });

  test("tool activity mid-turn is working", () => {
    expect(statusAfter(turn(1).slice(0, 2))).toBe("working");
  });

  test("aborted stop is your turn, other stop statuses are errors", () => {
    expect(statusAfter(turn(1, "aborted"))).toBe("your_turn");
    expect(statusAfter(turn(1, "error"))).toBe("error");
  });

  test("the error stop Cursor emits right after an interrupt is not an error", () => {
    // Recorded from a real Cursor CLI session interrupted mid-turn.
    const interrupted: HookEvent[] = [
      ...turn(1).slice(0, 3),
      { ts: 1000, event: "stop", stopStatus: "aborted" },
      { ts: 1015, event: "stop", stopStatus: "error" },
    ];
    expect(statusAfter(interrupted, alive, 2000)).toBe("your_turn");
    expect(statusAfter([...interrupted, ...turn(5000, "error")], alive, 6000)).toBe("error");
  });

  test("sessionEnd or a dead/missing window is exited", () => {
    expect(statusAfter([...turn(1), { ts: 9, event: "sessionEnd" }])).toBe("exited");
    expect(statusAfter(turn(1), dead)).toBe("exited");
    expect(deriveStatus(ym, applyEvents(initialState(), turn(1)), undefined, 10)).toBe("exited");
  });

  test("working with no events for too long is stale", () => {
    expect(statusAfter(turn(1).slice(0, 1), alive, 1 + STALE_MS + 1)).toBe("stale");
  });

  test("imported chat without events is imported until resumed", () => {
    expect(deriveStatus({ source: "import" }, initialState(), undefined, 0)).toBe("imported");
    const resumed = applyEvents(initialState(), [{ ts: 1, event: "ymLaunch", withPrompt: false }]);
    expect(deriveStatus({ source: "import" }, resumed, alive, 2)).toBe("your_turn");
  });

  test("unknown events keep the status but bump activity", () => {
    const s = applyEvents(initialState(), [...turn(1), { ts: 50, event: "afterAgentResponse" }]);
    expect(s.base).toBe("your_turn");
    expect(s.lastEventAt).toBe(50);
  });
});
