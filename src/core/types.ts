export type Status =
  | "your_turn"
  | "error"
  | "working"
  | "stale"
  | "exited"
  | "imported";

export type HighlightColor =
  | "blue"
  | "cyan"
  | "green"
  | "magenta"
  | "red"
  | "yellow";

export type Agent = "cursor" | "codex";

export interface Session {
  id: string;
  name: string;
  /** Absent on sessions from before Codex support, which are all Cursor. */
  agent?: Agent;
  /** Workspace the agent runs in. */
  cwd: string;
  /** Extra workspace roots, passed as --add-dir. */
  addDirs?: string[];
  /**
   * Empty while `agent create-chat` is still running for a freshly started session.
   * Codex has no create-chat: its id arrives from the SessionStart hook after launch.
   */
  chatId: string;
  /** When the agent pane was first started; lets a Codex session run before its chat id is known. */
  launchedAt?: number;
  source: "ym" | "import";
  createdAt: number;
  archivedAt?: number;
  /** Optional dashboard row highlight color. */
  highlightColor?: HighlightColor;
  /**
   * Worktree (and branch) name. Cursor manages its own; Codex sessions run in one ym creates.
   * Absent for sessions launched in the source workspace.
   */
  worktree?: string;
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
