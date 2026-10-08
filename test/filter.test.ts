import { describe, expect, test } from "bun:test";
import { filterRows, tabCounts, type Row } from "../src/core/filter.ts";
import type { Session, Status } from "../src/core/types.ts";

let n = 0;
function row(status: Status, lastActivity: number, archived = false): Row {
  const session: Session = {
    id: `0000000${n++}`.slice(-8),
    name: `${status}-${lastActivity}`,
    cwd: "/tmp",
    chatId: "c",
    source: status === "imported" ? "import" : "ym",
    createdAt: 0,
  };
  if (archived) session.archivedAt = 1;
  return { session, status, lastActivity };
}

const rows = [
  row("exited", 5),
  row("working", 3),
  row("your_turn", 1),
  row("your_turn", 2),
  row("stale", 9),
  row("imported", 8),
  row("error", 4),
  row("your_turn", 7, true),
];

const names = (r: Row[]) => r.map((x) => x.session.name);

describe("filter", () => {
  test("All excludes archived and sorts by status priority, then most recent", () => {
    expect(names(filterRows(rows, "all"))).toEqual([
      "your_turn-2",
      "your_turn-1",
      "error-4",
      "working-3",
      "stale-9",
      "exited-5",
      "imported-8",
    ]);
  });

  test("Working tab includes stale sessions", () => {
    expect(names(filterRows(rows, "working"))).toEqual(["working-3", "stale-9"]);
  });

  test("Archived tab only shows archived sessions", () => {
    expect(names(filterRows(rows, "archived"))).toEqual(["your_turn-7"]);
  });

  test("counts per tab", () => {
    expect(tabCounts(rows)).toEqual({
      all: 7,
      your_turn: 2,
      working: 2,
      error: 1,
      exited: 1,
      imported: 1,
      archived: 1,
    });
  });
});
