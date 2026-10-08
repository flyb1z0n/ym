import { describe, expect, test } from "bun:test";
import { launchCommand } from "../src/core/cursor.ts";

describe("launchCommand", () => {
  test("includes an explicit processing model when set", () => {
    expect(
      launchCommand({
        chatId: "chat-id",
        model: "gpt-5.6-sol-high",
      }),
    ).toEqual(["agent", "--resume", "chat-id", "--trust", "--model", "gpt-5.6-sol-high"]);
  });

  test("launches and resumes in a named worktree", () => {
    expect(
      launchCommand({
        chatId: "chat-id",
        worktree: "a1b2c3d4",
        addDirs: ["/extra"],
        prompt: "do it",
      }),
    ).toEqual([
      "agent",
      "--resume",
      "chat-id",
      "--trust",
      "--worktree",
      "a1b2c3d4",
      "--add-dir",
      "/extra",
      "do it",
    ]);
  });

  test("omits the worktree flag for existing non-worktree sessions", () => {
    expect(launchCommand({ chatId: "chat-id" })).toEqual(["agent", "--resume", "chat-id", "--trust"]);
  });
});
