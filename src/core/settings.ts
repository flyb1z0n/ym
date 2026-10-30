import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { AGENTS, isAgent } from "./agents.ts";
import { settingsFile, ymHome } from "./paths.ts";
import type { Agent } from "./types.ts";

export interface Settings {
  /** Ask a small model for a one-sentence session name instead of showing the prompt's first line. */
  nameSessions: boolean;
  /** Greet the user as "Main" instead of "Master". */
  callMeMain: boolean;
  /** Agent for prompts without a `#agent` tag; always one of `enabledAgents`. */
  defaultAgent: Agent;
  /** Agents Shift-Tab cycles through, in `AGENTS` order; never empty. */
  enabledAgents: Agent[];
  /** Launch Cursor with `--force` so it runs commands without asking. */
  cursorAutoRun: boolean;
  /** Folder holding all the user's repos; ym and its sessions start here. `ym` asks for it while it's unset. */
  devDir?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  nameSessions: true,
  callMeMain: false,
  defaultAgent: "cursor",
  enabledAgents: [...AGENTS],
  cursorAutoRun: false,
};

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const agentList = (value: unknown): Agent[] => {
  const listed = Array.isArray(value) ? AGENTS.filter((a) => value.includes(a)) : [];
  return listed.length ? listed : [...DEFAULT_SETTINGS.enabledAgents];
};

/** Turns `agent` on or off; the last enabled agent stays on, and the default moves off a disabled agent. */
export function toggleAgent(settings: Settings, agent: Agent): Settings {
  const on = settings.enabledAgents.includes(agent);
  if (on && settings.enabledAgents.length === 1) return settings;
  const enabledAgents = AGENTS.filter((a) => (a === agent ? !on : settings.enabledAgents.includes(a)));
  const defaultAgent = enabledAgents.includes(settings.defaultAgent) ? settings.defaultAgent : enabledAgents[0]!;
  return { ...settings, enabledAgents, defaultAgent };
}

export function loadSettings(): Settings {
  try {
    const value = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
    const enabledAgents = agentList(value.enabledAgents);
    const defaultAgent = isAgent(value.defaultAgent) ? value.defaultAgent : DEFAULT_SETTINGS.defaultAgent;
    return {
      nameSessions: flag(value.nameSessions, DEFAULT_SETTINGS.nameSessions),
      callMeMain: flag(value.callMeMain, DEFAULT_SETTINGS.callMeMain),
      defaultAgent: enabledAgents.includes(defaultAgent) ? defaultAgent : enabledAgents[0]!,
      enabledAgents,
      cursorAutoRun: flag(value.cursorAutoRun, DEFAULT_SETTINGS.cursorAutoRun),
      ...(typeof value.devDir === "string" && value.devDir ? { devDir: value.devDir } : {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, enabledAgents: [...DEFAULT_SETTINGS.enabledAgents] };
  }
}

export function saveSettings(settings: Settings): void {
  mkdirSync(ymHome(), { recursive: true });
  const path = settingsFile();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2));
  renameSync(tmp, path);
}
