import type { Session, Status } from "./types.ts";

export type TabId = "all" | "your_turn" | "working" | "error" | "exited" | "imported" | "archived";

export const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "your_turn", label: "Your turn" },
  { id: "working", label: "Working" },
  { id: "error", label: "Error" },
  { id: "exited", label: "Exited" },
  { id: "imported", label: "Imported" },
  { id: "archived", label: "Archived" },
];

export interface Row {
  session: Session;
  status: Status;
  lastActivity: number;
}

const ORDER: Record<Status, number> = {
  your_turn: 0,
  error: 1,
  working: 2,
  stale: 3,
  exited: 4,
  imported: 5,
};

function tabOf(status: Status): TabId {
  return status === "stale" ? "working" : status;
}

export function matchesTab(row: Row, tab: TabId): boolean {
  const archived = row.session.archivedAt !== undefined;
  if (tab === "archived") return archived;
  if (archived) return false;
  return tab === "all" || tabOf(row.status) === tab;
}

export function sortRows(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.lastActivity - a.lastActivity,
  );
}

export function filterRows(rows: Row[], tab: TabId): Row[] {
  return sortRows(rows.filter((r) => matchesTab(r, tab)));
}

export function tabCounts(rows: Row[]): Record<TabId, number> {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<TabId, number>;
  for (const r of rows) for (const t of TABS) if (matchesTab(r, t.id)) counts[t.id]++;
  return counts;
}
