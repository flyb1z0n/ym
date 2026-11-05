import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToString } from "ink";
import { DevDirPrompt } from "../src/ui/DevDirPrompt.tsx";

const root = realpathSync(mkdtempSync(join(tmpdir(), "ym-devdir-")));
for (const d of ["api", "web", ".hidden"]) mkdirSync(join(root, d));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const prompt = (missing?: string, initial = "~/dev") =>
  renderToString(<DevDirPrompt initial={initial} missing={missing} width={80} onPick={() => {}} />, { columns: 80 });

describe("DevDirPrompt", () => {
  test("asks for the folder with repositories, pre-filled, with the keys below", () => {
    const out = prompt();
    expect(out).toContain("The folder that contains all your repositories.");
    expect(out).toContain("› ~/dev");
    expect(out).toContain("↑↓ pick · Tab completes · Enter saves · Esc cancels");
    expect(out).not.toContain("no longer exists");
  });

  test("says when the saved folder is gone", () => {
    expect(prompt("/tmp/gone-dev")).toContain("/tmp/gone-dev no longer exists.");
  });

  test("lists the folders that complete the typed path", () => {
    const out = prompt(undefined, `${root}/`);
    expect(out).toMatch(/ \S*ym-devdir-\w+\/api\/ /);
    expect(out).toMatch(/ \S*ym-devdir-\w+\/web\/ /);
    expect(out).not.toContain(".hidden");
    expect(prompt(undefined, `${root}/w`)).not.toContain("/api/");
  });
});
