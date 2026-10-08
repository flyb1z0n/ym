import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "../core/filter.ts";
import { notify } from "../core/notify.ts";
import { applyEvents, deriveStatus, initialState, isStarting, type SessionState } from "../core/status.ts";
import { EventReader, listSessions } from "../core/store.ts";
import { listAgentPanes } from "../core/tmux.ts";
import type { Status, PaneInfo } from "../core/types.ts";
import { STATUS_STYLE } from "./format.ts";

const NOTIFY_ON = new Set<Status>(["your_turn", "error", "exited"]);
const TICK_MS = 1000;

export interface DashboardData {
  rows: Row[];
  panes: Map<string, PaneInfo>;
  refresh: () => void;
}

export function useDashboard(): DashboardData {
  const reader = useRef(new EventReader());
  const states = useRef(new Map<string, SessionState>());
  const previous = useRef(new Map<string, Status>());
  const [data, setData] = useState<{ rows: Row[]; panes: Map<string, PaneInfo> }>({
    rows: [],
    panes: new Map(),
  });

  const refresh = useCallback(() => {
    const now = Date.now();
    const sessions = listSessions();
    const panes = listAgentPanes();
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const session of sessions) {
      seen.add(session.id);
      const state = applyEvents(states.current.get(session.id) ?? initialState(), reader.current.read(session.id));
      states.current.set(session.id, state);
      const status = deriveStatus(session, state, panes.get(session.id), now);
      rows.push({ session, status, lastActivity: Math.max(state.lastEventAt, session.createdAt) });

      const before = previous.current.get(session.id);
      if (before && before !== status && NOTIFY_ON.has(status) && session.archivedAt === undefined) {
        notify(`ym: ${session.name}`, STATUS_STYLE[status].label);
      }
      // A session leaving its starting state isn't a status change worth notifying about.
      if (!isStarting(session)) previous.current.set(session.id, status);
    }
    for (const id of states.current.keys()) {
      if (seen.has(id)) continue;
      states.current.delete(id);
      previous.current.delete(id);
      reader.current.forget(id);
    }
    setData({ rows, panes });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, TICK_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { ...data, refresh };
}
