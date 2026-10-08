import { existsSync, realpathSync, statSync } from "node:fs";
import { createChat, launchCommand, worktreePath } from "./cursor.ts";
import type { CursorChat } from "./importer.ts";
import { expandHome } from "./paths.ts";
import { appendEvent, deleteSession, newSessionId, saveSession } from "./store.ts";
import { killWindow, newWindow } from "./tmux.ts";
import type { Session } from "./types.ts";

export interface NewSessionInput {
  prompt: string;
  cwd: string;
  name?: string;
  model?: string;
  worktree?: string;
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

const sessionEnv = (s: Session) => ({ YM_SESSION_ID: s.id });

export async function startSession(input: NewSessionInput): Promise<Session> {
  const cwd = resolveDir(input.cwd);
  const worktree = input.worktree?.trim() || undefined;
  if (worktree && !/^[\w.-]+$/.test(worktree)) throw new Error(`Invalid worktree name: ${worktree}`);
  const runCwd = worktree ? worktreePath(cwd, worktree) : cwd;
  if (!runCwd) throw new Error(`Worktrees need a git repository: ${cwd}`);

  const chatId = await createChat(cwd);
  const id = newSessionId();
  const prompt = input.prompt.trim();
  const session: Session = {
    id,
    name: input.name?.trim() || defaultName(prompt, id),
    cwd: runCwd,
    chatId,
    model: input.model?.trim() || undefined,
    worktree,
    source: "ym",
    createdAt: Date.now(),
  };
  saveSession(session);
  appendEvent(id, { ts: Date.now(), event: "ymLaunch", withPrompt: !!prompt });
  newWindow({
    name: id,
    cwd,
    env: sessionEnv(session),
    command: launchCommand({ chatId, model: session.model, worktree, prompt }),
  });
  return session;
}

export function resumeSession(s: Session): void {
  if (!existsSync(s.cwd)) throw new Error(`Folder no longer exists: ${s.cwd}`);
  killWindow(s.id);
  appendEvent(s.id, { ts: Date.now(), event: "ymLaunch", withPrompt: false });
  newWindow({
    name: s.id,
    cwd: s.cwd,
    env: sessionEnv(s),
    command: launchCommand({ chatId: s.chatId, model: s.model }),
  });
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

export const stopSession = (s: Session) => killWindow(s.id);

export function removeSession(s: Session): void {
  killWindow(s.id);
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
