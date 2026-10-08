import { existsSync, realpathSync, statSync } from "node:fs";
import { createChat, launchCommand } from "./cursor.ts";
import type { CursorChat } from "./importer.ts";
import { isGitRepo, suggestWorktreeName, uniqueWorktreeName } from "./naming.ts";
import { expandHome } from "./paths.ts";
import { loadSettings } from "./settings.ts";
import { isStarting, START_TIMEOUT_MS } from "./status.ts";
import { appendEvent, deleteSession, loadSession, newSessionId, saveSession } from "./store.ts";
import { killAgentPane, newAgentPane, respawnAgentPane, type AgentLaunch } from "./tmux.ts";
import type { PaneInfo, Session } from "./types.ts";
import { removeWorktree } from "./worktree.ts";

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

/**
 * Saves the session before `agent create-chat` returns so the dashboard lists it at once;
 * `onCreated` receives it in that chat-less state.
 */
export async function startSession(
  input: NewSessionInput,
  onCreated?: (s: Session) => void,
): Promise<Session> {
  const [cwd, ...addDirs] = [...new Set(input.folders.map(resolveDir))];
  if (!cwd) throw new Error("No folder to start in.");
  const settings = loadSettings();
  const id = newSessionId();
  const prompt = input.prompt.trim();
  const draft: Session = {
    id,
    name: input.name?.trim() || defaultName(prompt, id),
    cwd,
    chatId: "",
    source: "ym",
    createdAt: Date.now(),
  };
  if (addDirs.length) draft.addDirs = addDirs;
  const useWorktree = settings.useWorktrees && isGitRepo(cwd);
  if (useWorktree) draft.worktree = id;
  saveSession(draft);
  onCreated?.(draft);

  let chatId: string;
  let suggested: string | undefined;
  try {
    [chatId, suggested] = await Promise.all([
      createChat(cwd),
      useWorktree && settings.nameWorktrees && prompt ? suggestWorktreeName(prompt) : undefined,
    ]);
  } catch (e) {
    deleteSession(id);
    throw e;
  }
  // Re-read: the user may have renamed, archived, or removed it while the chat was being created.
  const current = loadSession(id);
  if (!current) throw new Error(`${draft.name} was removed before Cursor started.`);
  const session: Session = { ...current, chatId };
  if (suggested) session.worktree = uniqueWorktreeName(suggested, cwd);
  saveSession(session);
  appendEvent(id, { ts: Date.now(), event: "ymLaunch", withPrompt: !!prompt });
  newAgentPane(agentLaunch(session, prompt));
  return session;
}

/** Restarts the agent in its existing pane, or in a new window if it has none. */
export function resumeSession(s: Session, pane: PaneInfo | undefined): void {
  if (isStarting(s)) {
    throw new Error(
      Date.now() - s.createdAt > START_TIMEOUT_MS
        ? "This session never finished starting. Remove it and start a new one."
        : "Cursor is still starting this session…",
    );
  }
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
  if (s.worktree) removeWorktree(s.cwd, s.worktree);
  deleteSession(s.id);
}

/** The on-disk copy, which may have gained its chat id since the dashboard last read it. */
const latest = (s: Session) => loadSession(s.id) ?? s;

export function renameSession(s: Session, name: string): void {
  const cur = latest(s);
  saveSession({ ...cur, name: name.trim() || cur.name });
}

export function toggleArchive(s: Session): Session {
  const next: Session = { ...latest(s) };
  if (next.archivedAt === undefined) next.archivedAt = Date.now();
  else delete next.archivedAt;
  saveSession(next);
  return next;
}
