import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFolderIndex, parsePrompt, rootFolders, suggestFolders, trailingTag } from "../src/core/folders.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ym-folders-")));
for (const d of ["common-api", "front-end", "private/ym", "private/notes", "repo/.git", "repo/src", ".hidden"]) {
  mkdirSync(join(root, d), { recursive: true });
}
afterAll(() => rmSync(root, { recursive: true, force: true }));

const p = (rel: string) => join(root, rel);

describe("folders", () => {
  test("root folders include grandchildren only under non-repo folders", () => {
    expect(rootFolders([root])).toEqual([
      p("common-api"),
      p("front-end"),
      p("private"),
      p("private/notes"),
      p("private/ym"),
      p("repo"),
    ]);
  });

  test("index de-duplicates while keeping priority order", () => {
    expect(buildFolderIndex(["/b", "/a"], ["/a", "/c"])).toEqual(["/b", "/a", "/c"]);
  });

  test("trailingTag finds the @tag being typed at the end", () => {
    expect(trailingTag("fix @com")).toEqual({ start: 4, query: "com" });
    expect(trailingTag("@")).toEqual({ start: 0, query: "" });
    expect(trailingTag("mail a@b.com")).toBeUndefined();
    expect(trailingTag("@x done")).toBeUndefined();
  });

  test("suggestions match names first, then paths, and complete typed paths", () => {
    const index = [p("front-end"), p("common-api"), p("private/ym")];
    expect(suggestFolders("com", index)).toEqual([p("common-api")]);
    expect(suggestFolders("private", index)).toEqual([p("private/ym")]);
    expect(suggestFolders(`${root}/pri`, index)).toEqual([p("private")]);
    expect(suggestFolders(`${root}/private/`, index)).toEqual([p("private/notes"), p("private/ym")]);
  });

  test("parsePrompt pulls folders out of the prompt text", () => {
    const index = [p("common-api"), p("private/ym")];
    expect(parsePrompt(`@common-api @${p("front-end")} add field X`, index)).toEqual({
      prompt: "add field X",
      folders: [p("common-api"), p("front-end")],
      errors: [],
    });
    expect(parsePrompt("email a@b.com about @nope", index)).toEqual({
      prompt: "email a@b.com about",
      folders: [],
      errors: ["Unknown folder @nope"],
    });
  });
});
