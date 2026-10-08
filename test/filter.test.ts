import { describe, expect, test } from "bun:test";
import { filterRows, flattenGroups, groupRows, tabCounts, type Row } from "../src/core/filter.ts";
import type { Session, Status } from "../src/core/types.ts";

let n = 0;
function row(status: Status, lastActivity: number, cwd = "/a", archived = false): Row {
  const session: Session = {
    id: `0000000${n++}`.slice(-8),
    name: `${status}-${lastActivity}`,
    cwd,
    chatId: "c",
    source: status === "imported" ? "import" : "ym",
    createdAt: 0,
  };
  if (archived) session.archivedAt = 1;
  return { session, status, lastActivity };
}

const rows = [
  row("exited", 5, "/b"),
  row("working", 3),
  row("your_turn", 1, "/b"),
  row("your_turn", 2),
  row("stale", 9),
  row("imported", 8, "/c"),
  row("error", 4),
  row("your_turn", 7, "/a", true),
];

const names = (r: Row[]) => r.map((x) => x.session.name);

describe("tabs", () => {
  test("Sessions excludes archived; Archived shows only archived", () => {
    expect(filterRows(rows, "sessions")).toHaveLength(7);
    expect(names(filterRows(rows, "archived"))).toEqual(["your_turn-7"]);
    expect(tabCounts(rows)).toEqual({ sessions: 7, archived: 1 });
  });
});

describe("grouping", () => {
  const active = filterRows(rows, "sessions");

  test("by status: groups in priority order, most recent first inside each", () => {
    const groups = groupRows(active, "status");
    expect(groups.map((g) => g.label)).toEqual(["Ready", "Error", "Working", "Stale", "Exited", "Imported"]);
    expect(names(groups[0]!.rows)).toEqual(["your_turn-2", "your_turn-1"]);
  });

  test("by folder: folders ordered by their most recent session", () => {
    const groups = groupRows(active, "folder");
    expect(groups.map((g) => g.label)).toEqual(["/a", "/c", "/b"]);
    expect(names(groups[0]!.rows)).toEqual(["stale-9", "error-4", "working-3", "your_turn-2"]);
  });

  test("by date: one flat list without a header", () => {
    const groups = groupRows(active, "date");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBeUndefined();
    expect(names(flattenGroups(groups))).toEqual([
      "stale-9", "imported-8", "exited-5", "error-4", "working-3", "your_turn-2", "your_turn-1",
    ]);
  });

  test("empty input yields no groups", () => {
    expect(groupRows([], "date")).toEqual([]);
    expect(groupRows([], "status")).toEqual([]);
  });
});
