import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { DevDirPrompt } from "../src/ui/DevDirPrompt.tsx";

const prompt = (missing?: string) =>
  renderToString(<DevDirPrompt initial="~/dev" missing={missing} width={80} onPick={() => {}} />, { columns: 80 });

describe("DevDirPrompt", () => {
  test("asks for the folder with repositories, pre-filled, with the keys below", () => {
    const out = prompt();
    expect(out).toContain("The folder that contains all your repositories.");
    expect(out).toContain("› ~/dev");
    expect(out).toContain("Enter saves · Esc cancels");
    expect(out).not.toContain("no longer exists");
  });

  test("says when the saved folder is gone", () => {
    expect(prompt("/tmp/gone-dev")).toContain("/tmp/gone-dev no longer exists.");
  });
});
