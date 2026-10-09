import { basename } from "node:path";
import { homedir } from "node:os";
import type { Status } from "../core/types.ts";

export const STATUS_STYLE: Record<Status, { icon: string; label: string; color: string }> = {
  your_turn: { icon: "●", label: "ready", color: "yellow" },
  error: { icon: "!", label: "error", color: "red" },
  working: { icon: "◐", label: "working", color: "cyan" },
  stale: { icon: "◌", label: "stale?", color: "magenta" },
  exited: { icon: "○", label: "stopped", color: "gray" },
  imported: { icon: "↓", label: "imported", color: "blue" },
};

export function age(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function folder(cwd: string): string {
  return cwd === homedir() ? "~" : basename(cwd);
}

export function tildify(path: string): string {
  const home = homedir();
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length > width) return width === 1 ? "…" : `${text.slice(0, width - 1)}…`;
  return text.padEnd(width);
}

/** Start index of a `height`-row window that keeps `index` visible. */
export function windowStart(length: number, index: number, height: number): number {
  if (length <= height) return 0;
  const start = Math.max(0, index - Math.floor(height / 2));
  return Math.min(start, length - height);
}
