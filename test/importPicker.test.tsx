import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import type { Chat } from "../src/core/importer.ts";
import { ImportPicker } from "../src/ui/ImportPicker.tsx";

const now = Date.now();
const chat = (title: string, i: number): Chat => ({
  agent: "cursor",
  chatId: String(i),
  cwd: "/tmp/proj",
  title,
  createdAt: now,
  updatedAt: now - i * 1000,
});
const picker = (chats: Chat[], width = 80) =>
  renderToString(<ImportPicker chats={chats} width={width} height={10} onImport={() => {}} onClose={() => {}} />, {
    columns: width,
  });

describe("ImportPicker", () => {
  test("points at the selected chat without relying on color", () => {
    const lines = picker([chat("first", 0), chat("second", 1)]).split("\n");
    expect(lines.find((l) => l.includes("first"))).toMatch(/› cursor first/);
    expect(lines.find((l) => l.includes("second"))).toMatch(/ {2}cursor second/);
  });

  test("keeps every row inside the border", () => {
    const out = picker([chat("a very long chat title ".repeat(5), 0)], 50);
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(50);
  });
});
