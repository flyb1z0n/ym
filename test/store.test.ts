import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toEvent } from "../src/core/hook.ts";
import { eventsFile } from "../src/core/paths.ts";
import {
  appendEvent,
  deleteSession,
  EventReader,
  listSessions,
  parseEventLines,
  saveSession,
} from "../src/core/store.ts";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ym-test-"));
  process.env.YM_HOME = home;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.YM_HOME;
});

describe("store", () => {
  test("parseEventLines ignores a truncated last line and corrupt lines", () => {
    const text = '{"ts":1,"event":"stop"}\nnot json\n{"ts":2,"ev';
    const { events, consumed } = parseEventLines(text);
    expect(events).toEqual([{ ts: 1, event: "stop" }]);
    expect(consumed).toBe(text.lastIndexOf("\n") + 1);
  });

  test("EventReader returns only new events and picks up completed partial lines", () => {
    const reader = new EventReader();
    appendEvent("aaaaaaaa", { ts: 1, event: "beforeSubmitPrompt" });
    expect(reader.read("aaaaaaaa")).toHaveLength(1);
    expect(reader.read("aaaaaaaa")).toHaveLength(0);
    appendFileSync(eventsFile("aaaaaaaa"), '{"ts":2,"event":"st');
    expect(reader.read("aaaaaaaa")).toHaveLength(0);
    appendFileSync(eventsFile("aaaaaaaa"), 'op"}\n');
    expect(reader.read("aaaaaaaa")).toEqual([{ ts: 2, event: "stop" }]);
  });

  test("sessions round-trip and delete removes events", () => {
    saveSession({ id: "bbbbbbbb", name: "x", cwd: "/", chatId: "c", source: "ym", createdAt: 1 });
    appendEvent("bbbbbbbb", { ts: 1, event: "stop" });
    expect(listSessions().map((s) => s.id)).toEqual(["bbbbbbbb"]);
    deleteSession("bbbbbbbb");
    expect(listSessions()).toEqual([]);
    expect(new EventReader().read("bbbbbbbb")).toEqual([]);
  });

  test("hook events keep only the fields ym needs", () => {
    const ev = toEvent(
      "stop",
      { conversation_id: "chat", status: "completed", tool_name: undefined, prompt: "secret" } as never,
      5,
    );
    expect(ev).toEqual({ ts: 5, event: "stop", chatId: "chat", stopStatus: "completed" });
  });
});
