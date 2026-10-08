import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchCommand } from "../src/core/cursor.ts";
import { scanChats } from "../src/core/importer.ts";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ym-chats-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function chat(hash: string, id: string, meta: object, opts: { storeName?: string; history?: string[] } = {}) {
  const dir = join(root, hash, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  if (opts.storeName) {
    const db = new Database(join(dir, "store.db"));
    db.run("create table meta (key text primary key, value text)");
    const hex = Buffer.from(JSON.stringify({ name: opts.storeName })).toString("hex");
    db.run("insert into meta values ('0', ?)", [hex]);
    db.close();
  }
  if (opts.history) writeFileSync(join(dir, "prompt_history.json"), JSON.stringify(opts.history));
}

describe("importer", () => {
  test("titles come from meta.json, then store.db, then prompt history", () => {
    chat("h1", "a", { cwd: "/p/one", title: "Meta Title", hasConversation: true, updatedAtMs: 3 });
    chat("h1", "b", { cwd: "/p/one", hasConversation: true, updatedAtMs: 2 }, { storeName: "Store Title" });
    chat("h2", "c", { cwd: "/p/two", hasConversation: true, updatedAtMs: 1 }, { history: ["first prompt"] });
    chat("h2", "d", { cwd: "/p/two", hasConversation: false, updatedAtMs: 9 });
    const chats = scanChats(root);
    expect(chats.map((c) => [c.chatId, c.title, c.cwd])).toEqual([
      ["a", "Meta Title", "/p/one"],
      ["b", "Store Title", "/p/one"],
      ["c", "first prompt", "/p/two"],
    ]);
  });
});

describe("cursor", () => {
  test("builds launch command lines", () => {
    expect(launchCommand({ chatId: "c" })).toEqual(["agent", "--resume", "c", "--trust"]);
    expect(launchCommand({ chatId: "c", addDirs: ["/a", "/b"], prompt: "-x" })).toEqual([
      "agent", "--resume", "c", "--trust", "--add-dir", "/a", "--add-dir", "/b", " -x",
    ]);
  });
});
