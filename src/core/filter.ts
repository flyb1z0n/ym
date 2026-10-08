import type { Session, Status } from "./types.ts";

export type TabId = "sessions" | "archived";

export const TABS: { id: TabId; label: string }[] = [
  { id: "sessions", label: "Sessions" },
  { id: "archived", label: "Archived" },
];

export interface Row {
  session: Session;
  status: Status;
  lastActivity: number;
}

export function matchesTab(row: Row, tab: TabId): boolean {
  return (row.session.archivedAt !== undefined) === (tab === "archived");
}

export const filterRows = (rows: Row[], tab: TabId) => rows.filter((r) => matchesTab(r, tab));

export function tabCounts(rows: Row[]): Record<TabId, number> {
  const counts: Record<TabId, number> = { sessions: 0, archived: 0 };
  for (const r of rows) counts[r.session.archivedAt !== undefined ? "archived" : "sessions"]++;
  return counts;
}

export type GroupMode = "status" | "folder" | "date";

export const GROUP_MODES: { id: GroupMode; label: string }[] = [
  { id: "status", label: "status" },
  { id: "folder", label: "folder" },
  { id: "date", label: "date" },
];

export interface Group {
  key: string;
  /** Undefined for the flat date list, which has no headers. */
  label?: string;
  status?: Status;
  rows: Row[];
}

const STATUS_ORDER: Status[] = ["your_turn", "error", "working", "stale", "exited", "imported"];

export const STATUS_GROUP_LABEL: Record<Status, string> = {
  your_turn: "Your turn",
  error: "Error",
  working: "Working",
  stale: "Stale",
  exited: "Exited",
  imported: "Imported",
};

const byRecent = (a: Row, b: Row) => b.lastActivity - a.lastActivity;

export function groupRows(rows: Row[], mode: GroupMode): Group[] {
  if (mode === "date") return rows.length ? [{ key: "date", rows: [...rows].sort(byRecent) }] : [];
  if (mode === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_GROUP_LABEL[status],
      status,
      rows: rows.filter((r) => r.status === status).sort(byRecent),
    })).filter((g) => g.rows.length);
  }
  const byFolder = new Map<string, Row[]>();
  for (const r of [...rows].sort(byRecent)) {
    const list = byFolder.get(r.session.cwd) ?? [];
    list.push(r);
    byFolder.set(r.session.cwd, list);
  }
  return [...byFolder].map(([cwd, list]) => ({ key: cwd, label: cwd, rows: list }));
}

/** Rows in display order, which is also the selection order. */
export const flattenGroups = (groups: Group[]) => groups.flatMap((g) => g.rows);
