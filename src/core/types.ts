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
  /** Directory the agent runs in (the worktree path when one is used). */
  cwd: string;
  chatId: string;
  model?: string;
  worktree?: string;
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

export interface WindowInfo {
  name: string;
  dead: boolean;
}
