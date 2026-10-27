import { describe, expect, test } from "bun:test";
import chalk from "chalk";
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

  test("the logo border turns magenta through ym ssh while the greeting stays green", () => {
    const level = chalk.level;
    chalk.level = 1;
    try {
      const render = (remote?: string) =>
        renderToString(
          <Header rows={[]} tab="sessions" counts={{ sessions: 0, archived: 0 } as never} group="status" remote={remote} />,
          { columns: 80 },
        ).split("\n");
      const [top, middle] = render("devbox");
      expect(top).toStartWith("\x1b[35m╭");
      expect(middle).toStartWith("\x1b[35m│ \x1b[32mYes, Master!\x1b[35m │");
      expect(render()[0]).toStartWith("\x1b[32m╭");
    } finally {
      chalk.level = level;
    }
  });
});
