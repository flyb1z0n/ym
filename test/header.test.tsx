import { describe, expect, test } from "bun:test";
import { renderToString } from "ink";
import { Header } from "../src/ui/Header.tsx";

describe("Header", () => {
  test("keeps the logo intact in a narrow window", () => {
    const out = renderToString(
      <Header rows={[]} tab="sessions" counts={{ sessions: 10, archived: 0 } as never} group="status" />,
      { columns: 30 },
    );
    const lines = out.split("\n");
    expect(lines[0]).toStartWith("╭──────────────╮");
    expect(lines[1]).toStartWith("│ Yes, Master! │");
    expect(lines[2]).toStartWith("╰──────────────╯");
  });
});
