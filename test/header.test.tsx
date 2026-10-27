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

  test("shows the host next to the logo when viewed through ym ssh", () => {
    const render = (remote?: string) =>
      renderToString(
        <Header rows={[]} tab="sessions" counts={{ sessions: 0, archived: 0 } as never} group="status" remote={remote} />,
        { columns: 80 },
      ).split("\n");
    expect(render("devbox")[0]).toMatch(/^╭─+╮ ⇄ devbox {2}0 ready/);
    expect(render()[0]).toMatch(/^╭─+╮ 0 ready/);
  });
});
