import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachPastedImages, promptPastes, referencedImages, stripImageMarkers } from "../src/core/images.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ym-images-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const file = (name: string) => {
  const path = join(root, name);
  writeFileSync(path, "x");
  return path;
};
const plain = file("plain.png");
const spaced = file("red square.jpg");
const screenshot = file("Screenshot 2026-10-08 at 4.01.23\u202FPM.png");
file("notes.txt");

describe("images", () => {
  test("dropped paths become markers, however the terminal escapes them", () => {
    const escaped = screenshot.replace(/ /g, "\\ ");
    const { text, images } = attachPastedImages(
      `${plain} ${spaced.replace(/ /g, "\\ ")} '${spaced}' "${plain}" file://${encodeURI(screenshot)} ${escaped}`,
      [],
    );
    expect(text).toBe("[Image #1] [Image #2] [Image #2] [Image #1] [Image #3] [Image #3]");
    expect(images).toEqual([plain, spaced, screenshot]);
  });

  test("non-images and missing files stay as text; numbering continues from earlier pastes", () => {
    const { text, images } = attachPastedImages(`see ${join(root, "notes.txt")} ${join(root, "gone.png")} '${spaced}'`, [plain]);
    expect(text).toBe(`see ${join(root, "notes.txt")} ${join(root, "gone.png")} [Image #2]`);
    expect(images).toEqual([plain, spaced]);
  });

  test("each image is pasted on its own, as an escaped path", () => {
    expect(promptPastes("compare [Image #2] with [Image #1]  and [Image #9]", [plain, spaced])).toEqual([
      "compare ",
      spaced.replace(/ /g, "\\ "),
      "with ",
      plain,
      " and [Image #9]",
    ]);
    expect(promptPastes("[Image #1]", [plain])).toEqual([plain]);
  });

  test("only images still referenced by a marker count", () => {
    expect(referencedImages("fix [Image #2]", [plain, spaced])).toEqual([spaced]);
    expect(stripImageMarkers("[Image #1] fix  the [Image #2] layout")).toBe("fix the layout");
  });
});
