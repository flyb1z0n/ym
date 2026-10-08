import { existsSync, realpathSync, statSync } from "node:fs";
import { createChat, launchCommand } from "./cursor.ts";
import type { CursorChat } from "./importer.ts";
import { suggestWorktreeName, uniqueWorktreeName } from "./naming.ts";
import { expandHome } from "./paths.ts";
import { loadSettings } from "./settings.ts";
import { appendEvent, deleteSession, newSessionId, saveSession } from "./store.ts";
import { killAgentPane, newAgentPane, respawnAgentPane, type AgentLaunch } from "./tmux.ts";
import type { PaneInfo, Session } from "./types.ts";

export interface NewSessionInput {
  prompt: string;
  /** First folder is the workspace; the rest become --add-dir roots. */
  folders: string[];
  name?: string;
}

export function defaultName(prompt: string, id: string): string {
  const firstLine = prompt.trim().split("\n")[0]?.trim() ?? "";
  if (!firstLine) return `session ${id}`;
  return firstLine.length > 40 ? `${firstLine.slice(0, 39)}…` : firstLine;
}

export function resolveDir(input: string): string {
  const path = expandHome(input.trim());
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Not a directory: ${input}`);
  return realpathSync(path);
}

function agentLaunch(s: Session, prompt?: string): AgentLaunch {
  return {
    id: s.id,
    cwd: s.cwd,
    env: { YM_SESSION_ID: s.id },
    command: launchCommand({ chatId: s.chatId, addDirs: s.addDirs, prompt, worktree: s.worktree }),
  };
}

export async function startSession(input: NewSessionInput): Promise<Session> {
  const [cwd, ...addDirs] = [...new Set(input.folders.map(resolveDir))];
  if (!cwd) throw new Error("No folder to start in.");
  const settings = loadSettings();
  const prompt = input.prompt.trim();
  const [chatId, suggested] = await Promise.all([
    createChat(cwd),
    settings.useWorktrees && settings.nameWorktrees && prompt ? suggestWorktreeName(prompt) : undefined,
  ]);
  const id = newSessionId();
  const session: Session = {
    id,
    name: input.name?.trim() || defaultName(prompt, id),
    cwd,
    chatId,
    source: "ym",
    createdAt: Date.now(),
  };
  if (addDirs.length) session.addDirs = addDirs;
  if (settings.useWorktrees) session.worktree = suggested ? uniqueWorktreeName(suggested, cwd) : id;
  saveSession(session);
  appendEvent(id, { ts: Date.now(), event: "ymLaunch", withPrompt: !!prompt });
  newAgentPane(agentLaunch(session, prompt));
  return session;
}

/** Restarts the agent in its existing pane, or in a new window if it has none. */
export function resumeSession(s: Session, pane: PaneInfo | undefined): void {
  if (!existsSync(s.cwd)) throw new Error(`Folder no longer exists: ${s.cwd}`);
  appendEvent(s.id, { ts: Date.now(), event: "ymLaunch", withPrompt: false });
  if (pane) respawnAgentPane(pane.paneId, agentLaunch(s));
  else newAgentPane(agentLaunch(s));
}

export function importChat(chat: CursorChat): Session {
  const session: Session = {
    id: newSessionId(),
    name: chat.title,
    cwd: chat.cwd,
    chatId: chat.chatId,
    source: "import",
    createdAt: chat.updatedAt || Date.now(),
  };
  saveSession(session);
  return session;
}

export function stopSession(pane: PaneInfo | undefined): void {
  if (pane) killAgentPane(pane.paneId);
}

export function removeSession(s: Session, pane: PaneInfo | undefined): void {
  stopSession(pane);
  deleteSession(s.id);
}

export const renameSession = (s: Session, name: string) => saveSession({ ...s, name: name.trim() || s.name });

export function toggleArchive(s: Session): Session {
  const next: Session = { ...s };
  if (next.archivedAt === undefined) next.archivedAt = Date.now();
  else delete next.archivedAt;
  saveSession(next);
  return next;
}
