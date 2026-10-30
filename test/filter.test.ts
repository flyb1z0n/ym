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
    expect(groups.map((g) => g.label)).toEqual(["Working", "Error", "Stale", "Imported", "Ready", "Stopped"]);
    expect(names(groups.at(-2)!.rows)).toEqual(["your_turn-2", "your_turn-1"]);
  });

  test("by status: Working group is sorted by name, not recency", () => {
    const working = (name: string, lastActivity: number): Row => {
      const r = row("working", lastActivity);
      r.session.name = name;
      return r;
    };
    const groups = groupRows([working("beta", 9), working("Alpha", 1), working("task-10", 5), working("task-2", 7)], "status");
    expect(names(groups[0]!.rows)).toEqual(["Alpha", "beta", "task-2", "task-10"]);
  });

  test("by folder: folders ordered by their most recent session", () => {
    const groups = groupRows(active, "folder");
    expect(groups.map((g) => g.label)).toEqual(["/a", "/c", "/b"]);
    expect(names(groups[0]!.rows)).toEqual(["stale-9", "error-4", "working-3", "your_turn-2"]);
  });

  test("by folder: sessions with context group by their context folders, not where they run", () => {
    const withContext = (r: Row, contextFolders: string[]) => ({ ...r, session: { ...r.session, contextFolders } });
    const groups = groupRows(
      [
        withContext(row("working", 3, "/dev"), ["/dev/x", "/dev/y"]),
        withContext(row("working", 2, "/dev"), ["/dev/x"]),
        withContext(row("working", 1, "/dev"), ["/dev/x", "/dev/y"]),
        withContext(row("working", 0, "/dev"), []),
      ],
      "folder",
    );
    expect(groups.map((g) => g.folders)).toEqual([["/dev/x", "/dev/y"], ["/dev/x"], ["/dev"]]);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1, 1]);
  });

  test("by date: one flat list without a header", () => {
    const groups = groupRows(active, "date");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBeUndefined();
    expect(names(flattenGroups(groups))).toEqual([
      "stale-9", "imported-8", "exited-5", "error-4", "working-3", "your_turn-2", "your_turn-1",
    ]);
  });

  describe("pinned", () => {
    const pin = (r: Row, at: number): Row => ({ ...r, session: { ...r.session, pinnedAt: at } });
    const withPins = [pin(row("exited", 1, "/b"), 20), pin(row("working", 6, "/c"), 10), ...active];

    test("come first in pin order and leave their usual group", () => {
      for (const mode of ["status", "folder", "date"] as const) {
        const groups = groupRows(withPins, mode);
        expect(groups[0]).toMatchObject({ key: "pinned", label: "Pinned", pinned: true });
        expect(names(groups[0]!.rows)).toEqual(["working-6", "exited-1"]);
        expect(names(groups.slice(1).flatMap((g) => g.rows))).not.toContain("working-6");
      }
      expect(groupRows(withPins, "folder").map((g) => g.label)).toEqual(["Pinned", "/a", "/c", "/b"]);
    });

    test("by date: the rest gets a header so it doesn't run into Pinned", () => {
      expect(groupRows(withPins, "date").map((g) => g.label)).toEqual(["Pinned", "Recent"]);
    });

    test("only pinned sessions yields just the Pinned group", () => {
      expect(groupRows(withPins.slice(0, 2), "status").map((g) => g.label)).toEqual(["Pinned"]);
    });
  });

  test("empty input yields no groups", () => {
    expect(groupRows([], "date")).toEqual([]);
    expect(groupRows([], "status")).toEqual([]);
  });
});
