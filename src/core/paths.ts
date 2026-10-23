import { homedir } from "node:os";
import { join } from "node:path";

export const ymHome = () => process.env.YM_HOME ?? join(homedir(), ".ym");
export const sessionsDir = () => join(ymHome(), "sessions");
export const eventsDir = () => join(ymHome(), "events");
export const sessionFile = (id: string) => join(sessionsDir(), `${id}.json`);
export const eventsFile = (id: string) => join(eventsDir(), `${id}.jsonl`);
export const installedHooksFile = () => join(ymHome(), "installed-hooks.json");
/**
 * What agent hooks run. Agents read hooks.json only at startup, so its commands must outlive
 * whichever ym build registered them; `ym install` repoints this script instead.
 */
export const hookShimFile = () => join(ymHome(), "bin", "ym-hook");
export const settingsFile = () => join(ymHome(), "config.json");

/** Worktrees ym creates itself, for agents that can't name their own. */
export const ymWorktreesDir = () => join(ymHome(), "worktrees");

export const cursorHome = () => process.env.YM_CURSOR_HOME ?? join(homedir(), ".cursor");
export const codexHome = () => process.env.YM_CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
