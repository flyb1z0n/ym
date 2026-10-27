import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedUploader, uploadImages, uploadName } from "../src/ssh/upload.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ym-upload-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const file = (name: string) => {
  const path = join(root, name);
  writeFileSync(path, "x");
  return path;
};
const shot = file("Screenshot 2026-10-27 at 6.01.23\u202FPM.png");
const plain = file("plain.png");
file("notes.txt");

describe("uploadImages", () => {
  test("local image paths become escaped remote paths; other text is untouched", async () => {
    const uploaded: string[] = [];
    const text = await uploadImages(
      `look ${shot.replace(/ /g, "\\ ")} and ${join(root, "notes.txt")} ${join(root, "gone.png")}`,
      async (p) => (uploaded.push(p), `/home/me dir/.ym/uploads/1-shot.png`),
      () => {},
    );
    expect(uploaded).toEqual([shot]);
    expect(text).toBe(`look /home/me\\ dir/.ym/uploads/1-shot.png and ${join(root, "notes.txt")} ${join(root, "gone.png")}`);
  });

  test("a failed upload leaves that path as it was and is reported", async () => {
    const errors: string[] = [];
    const text = await uploadImages(
      `${plain} ${shot.replace(/ /g, "\\ ")}`,
      async (p) => {
        if (p === plain) throw new Error("denied");
        return "/r/shot.png";
      },
      (p, e) => errors.push(`${p}: ${e.message}`),
    );
    expect(text).toBe(`${plain} /r/shot.png`);
    expect(errors).toEqual([`${plain}: denied`]);
  });

  test("text with no images skips the uploader", async () => {
    expect(await uploadImages("just text", () => Promise.reject(new Error("called")), () => {})).toBe("just text");
  });
});

describe("cachedUploader", () => {
  test("uploads a file once until it changes, and retries after a failure", async () => {
    let calls = 0;
    let fail = true;
    const upload = cachedUploader(async () => {
      calls++;
      if (fail) throw new Error("down");
      return `/r/${calls}`;
    });
    await expect(upload(plain)).rejects.toThrow("down");
    fail = false;
    expect(await upload(plain)).toBe("/r/2");
    expect(await upload(plain)).toBe("/r/2");
    utimesSync(plain, new Date(), new Date(Date.now() + 5000));
    expect(await upload(plain)).toBe("/r/3");
  });
});

test("remote names keep only shell-safe characters", () => {
  expect(uploadName(shot, 42)).toBe("42-Screenshot_2026-10-27_at_6.01.23_PM.png");
});
