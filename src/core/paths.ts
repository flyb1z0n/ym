import { homedir } from "node:os";
import { join } from "node:path";

export const ymHome = () => process.env.YM_HOME ?? join(homedir(), ".ym");
export const sessionsDir = () => join(ymHome(), "sessions");
export const eventsDir = () => join(ymHome(), "events");
export const sessionFile = (id: string) => join(sessionsDir(), `${id}.json`);
export const eventsFile = (id: string) => join(eventsDir(), `${id}.jsonl`);
export const installedHooksFile = () => join(ymHome(), "installed-hooks.json");
export const settingsFile = () => join(ymHome(), "config.json");

export const cursorHome = () => process.env.YM_CURSOR_HOME ?? join(homedir(), ".cursor");

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
