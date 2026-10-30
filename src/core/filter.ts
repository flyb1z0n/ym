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
  pinned?: boolean;
  /** The context folders shared by a folder group's sessions. */
  folders?: string[];
  rows: Row[];
}

/** The folders a session is about: its @tagged context, or the folder it runs in when it has none. */
export const sessionFolders = (s: Session): string[] => (s.contextFolders?.length ? s.contextFolders : [s.cwd]);

const STATUS_ORDER: Status[] = ["working", "error", "stale", "imported", "your_turn", "exited"];

export const STATUS_GROUP_LABEL: Record<Status, string> = {
  your_turn: "Ready",
  error: "Error",
  working: "Working",
  stale: "Stale",
  exited: "Stopped",
  imported: "Imported",
};

const byRecent = (a: Row, b: Row) => b.lastActivity - a.lastActivity;
const byName = (a: Row, b: Row) =>
  a.session.name.localeCompare(b.session.name, undefined, { numeric: true, sensitivity: "base" });

/** Working sessions emit events constantly, so recency order would reshuffle them on every tick. */
const STATUS_SORT: Partial<Record<Status, (a: Row, b: Row) => number>> = { working: byName };

const isPinned = (r: Row) => r.session.pinnedAt !== undefined;
/** Pin order, so pinned sessions keep their places while their status changes. */
const byPinned = (a: Row, b: Row) => a.session.pinnedAt! - b.session.pinnedAt!;

/** Pinned sessions come first in their own group, whatever the grouping mode. */
export function groupRows(rows: Row[], mode: GroupMode): Group[] {
  const pinned = rows.filter(isPinned).sort(byPinned);
  const rest = groupUnpinned(rows.filter((r) => !isPinned(r)), mode);
  if (!pinned.length) return rest;
  return [
    { key: "pinned", label: "Pinned", pinned: true, rows: pinned },
    // The date list has no header, which would run it into the Pinned group.
    ...rest.map((g) => (g.label ? g : { ...g, label: "Recent" })),
  ];
}

function groupUnpinned(rows: Row[], mode: GroupMode): Group[] {
  if (mode === "date") return rows.length ? [{ key: "date", rows: [...rows].sort(byRecent) }] : [];
  if (mode === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_GROUP_LABEL[status],
      status,
      rows: rows.filter((r) => r.status === status).sort(STATUS_SORT[status] ?? byRecent),
    })).filter((g) => g.rows.length);
  }
  const byFolder = new Map<string, Group>();
  for (const r of [...rows].sort(byRecent)) {
    const folders = sessionFolders(r.session);
    const key = folders.join("\n");
    const group = byFolder.get(key) ?? { key, label: folders.join(", "), folders, rows: [] };
    group.rows.push(r);
    byFolder.set(key, group);
  }
  return [...byFolder.values()];
}

/** Rows in display order, which is also the selection order. */
export const flattenGroups = (groups: Group[]) => groups.flatMap((g) => g.rows);
