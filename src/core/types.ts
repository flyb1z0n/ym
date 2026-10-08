export type Status =
  | "your_turn"
  | "error"
  | "working"
  | "stale"
  | "exited"
  | "imported";

export interface Session {
  id: string;
  name: string;
  /** Workspace the agent runs in. */
  cwd: string;
  /** Extra workspace roots, passed as --add-dir. */
  addDirs?: string[];
  chatId: string;
  source: "ym" | "import";
  createdAt: number;
  archivedAt?: number;
}

export interface HookEvent {
  ts: number;
  event: string;
  chatId?: string;
  tool?: string;
  stopStatus?: string;
  /** Only on ymLaunch: whether the agent was started with an initial prompt. */
  withPrompt?: boolean;
}

export interface PaneInfo {
  paneId: string;
  dead: boolean;
  /** Currently displayed on the right side of the dashboard. */
  shown: boolean;
}
