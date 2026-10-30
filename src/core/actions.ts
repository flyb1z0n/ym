import { existsSync, realpathSync, statSync } from "node:fs";
import { AGENT_NAMES, agentAvailable, agentOf, notFound } from "./agents.ts";
import { codexCommand, codexModel, findCodexSession } from "./codex.ts";
import { createChat, launchCommand, processingModel, PROMPT_BAR } from "./cursor.ts";
import { contextPrompt, worktreePrompt } from "./folders.ts";
import { promptPastes, referencedImages, stripImageMarkers } from "./images.ts";
import type { Chat } from "./importer.ts";
import { suggestSessionName } from "./naming.ts";
import { expandHome } from "./paths.ts";
import { loadSettings } from "./settings.ts";
import { isStarting, START_TIMEOUT_MS } from "./status.ts";
import { appendEvent, deleteSession, loadSession, newSessionId, saveSession } from "./store.ts";
import {
  capturePane,
  killAgentPane,
  newAgentPane,
  pasteText,
  pressEnter,
  respawnAgentPane,
  type AgentLaunch,
} from "./tmux.ts";
import type { Agent, HighlightColor, PaneInfo, Session } from "./types.ts";
import { ensureYmWorktree, removeWorktree } from "./worktree.ts";

export interface NewSessionInput {
  prompt: string;
  /** Named in the prompt for the agent to look at; the session itself starts in the dev directory. */
  folders: string[];
  /** Files behind the prompt's `[Image #N]` markers. */
  images?: string[];
  name?: string;
  /** Defaults to Cursor. */
  agent?: Agent;
}

const PROMPT_BAR_TIMEOUT_MS = 20_000;

/** Cursor attaches images only when their paths are pasted into its prompt bar, not from the prompt argument. */
async function submitWhenReady(paneId: string, pastes: string[]): Promise<void> {
  const end = Date.now() + PROMPT_BAR_TIMEOUT_MS;
  while (!PROMPT_BAR.test(capturePane(paneId))) {
    if (Date.now() > end) throw new Error("Cursor didn't show its prompt in time, so the prompt wasn't sent.");
    await Bun.sleep(200);
  }
  await Bun.sleep(300);
  for (const text of pastes) {
    pasteText(paneId, text);
    await Bun.sleep(150);
  }
  await Bun.sleep(300);
  pressEnter(paneId);
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

/** The dev directory, then the tagged folders outside it, which the agent couldn't open otherwise. */
function sessionDirs(devDir: string | undefined, folders: string[]): [string, ...string[]] {
  if (!devDir) throw new Error("Set a dev directory first in Ctrl-S settings.");
  const root = resolveDir(devDir);
  return [root, ...folders.filter((f) => f !== root && !f.startsWith(`${root}/`))];
}

/** Codex sessions from before agents made their own worktrees run in the one ym made for them. */
const codexDir = (s: Session) => (s.worktree ? ensureYmWorktree(s.cwd, s.worktree) : s.cwd);

function agentLaunch(s: Session, prompt?: string, images?: string[]): AgentLaunch {
  const env = { YM_SESSION_ID: s.id };
  if (agentOf(s) === "codex") {
    const cwd = codexDir(s);
    const chatId = s.chatId || undefined;
    return { id: s.id, cwd, env, command: codexCommand({ cwd, chatId, addDirs: s.addDirs, prompt, images, model: codexModel() }) };
  }
  return {
    id: s.id,
    cwd: s.cwd,
    env,
    command: launchCommand({
      chatId: s.chatId,
      addDirs: s.addDirs,
      prompt,
      worktree: s.worktree,
      model: processingModel(),
      autoRun: loadSettings().cursorAutoRun,
    }),
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
  const settings = loadSettings();
  const folders = [...new Set(input.folders.map(resolveDir))];
  const [cwd, ...addDirs] = sessionDirs(settings.devDir, folders);
  const agent = input.agent ?? "cursor";
  if (!agentAvailable(agent)) throw new Error(`${notFound(agent)}.`);
  const id = newSessionId();
  const prompt = input.prompt.trim();
  const sent = worktreePrompt(contextPrompt(prompt, folders));
  const images = referencedImages(prompt, input.images ?? []);
  const namingPrompt = stripImageMarkers(prompt);
  const draft: Session = {
    id,
    name: input.name?.trim() || defaultName(prompt, id),
    agent,
    cwd,
    chatId: "",
    source: "ym",
    createdAt: Date.now(),
    contextFolders: folders,
  };
  if (addDirs.length) draft.addDirs = addDirs;
  if (prompt) draft.prompt = prompt;
  if (images.length) draft.images = input.images;
  saveSession(draft);
  onCreated?.(draft);
  if (settings.nameSessions && namingPrompt && !input.name?.trim()) void nameInBackground(draft, namingPrompt);
  if (agent === "codex") return startCodex(draft, sent, images);

  const withImages = images.length > 0;
  let chatId: string;
  try {
    chatId = await createChat(cwd);
  } catch (e) {
    deleteSession(id);
    throw e;
  }
  // Re-read: the user may have renamed, archived, or removed it while the chat was being created.
  const current = loadSession(id);
  if (!current) throw new Error(`${draft.name} was removed before Cursor started.`);
  const session: Session = { ...current, chatId };
  saveSession(session);
  appendEvent(id, { ts: Date.now(), event: "ymLaunch", withPrompt: !!sent });
  const paneId = newAgentPane(agentLaunch(session, withImages ? undefined : sent));
  if (withImages) await submitWhenReady(paneId, promptPastes(sent, input.images ?? []));
  return session;
}

/** Doesn't hold up the launch; keeps the placeholder if the user renamed or removed the session meanwhile. */
async function nameInBackground(draft: Session, prompt: string): Promise<void> {
  const name = await suggestSessionName(prompt);
  if (!name) return;
  try {
    const current = loadSession(draft.id);
    if (current && current.name === draft.name) saveSession({ ...current, name });
  } catch {
    // The prompt-based name is a fine fallback.
  }
}

/** Codex can't create a chat up front: it launches right away and its SessionStart hook records the id. */
function startCodex(draft: Session, prompt: string, images: string[]): Session {
  const current = loadSession(draft.id);
  if (!current) throw new Error(`${draft.name} was removed before Codex started.`);
  const session: Session = { ...current, launchedAt: Date.now() };
  let launch: AgentLaunch;
  try {
    launch = agentLaunch(session, prompt || undefined, images);
  } catch (e) {
    deleteSession(draft.id);
    throw e;
  }
  saveSession(session);
  appendEvent(session.id, { ts: Date.now(), event: "ymLaunch", withPrompt: !!prompt });
  newAgentPane(launch);
  return session;
}

/** Restarts the agent in its existing pane, or in a new window if it has none. */
export function resumeSession(s: Session, pane: PaneInfo | undefined): void {
  const agent = AGENT_NAMES[agentOf(s)];
  if (isStarting(s)) {
    throw new Error(
      Date.now() - s.createdAt > START_TIMEOUT_MS
        ? "This session never finished starting. Remove it and start a new one."
        : `${agent} is still starting this session…`,
    );
  }
  if (!existsSync(s.cwd)) throw new Error(`Folder no longer exists: ${s.cwd}`);
  if (!agentAvailable(agentOf(s))) throw new Error(`${notFound(agentOf(s))}.`);
  if (agentOf(s) === "codex" && !s.chatId) {
    // Its SessionStart hook never ran (hooks not trusted yet), so look for the session Codex saved.
    const chatId = findCodexSession(codexDir(s), s.launchedAt ?? s.createdAt);
    if (!chatId) {
      throw new Error("Codex didn't save this session, so it can't be resumed. Remove it and start a new one.");
    }
    s = { ...latest(s), chatId };
    saveSession(s);
  }
  appendEvent(s.id, { ts: Date.now(), event: "ymLaunch", withPrompt: false });
  if (pane) respawnAgentPane(pane.paneId, agentLaunch(s));
  else newAgentPane(agentLaunch(s));
}

export function importChat(chat: Chat): Session {
  const session: Session = {
    id: newSessionId(),
    name: chat.title,
    agent: chat.agent,
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

/** The on-disk copy, which may have gained its chat id since the dashboard last read it. */
const latest = (s: Session) => loadSession(s.id) ?? s;

/**
 * The session is unlisted as soon as this returns; the promise settles once its worktree is cleaned up.
 * If that cleanup fails, the session is saved back so it can be retried.
 */
export async function removeSession(s: Session, pane: PaneInfo | undefined): Promise<void> {
  const saved = latest(s);
  stopSession(pane);
  deleteSession(s.id);
  if (!s.worktree) return;
  try {
    await removeWorktree(s.cwd, s.worktree);
  } catch (e) {
    saveSession(saved);
    throw e;
  }
}

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

export function togglePin(s: Session): Session {
  const next: Session = { ...latest(s) };
  if (next.pinnedAt === undefined) next.pinnedAt = Date.now();
  else delete next.pinnedAt;
  saveSession(next);
  return next;
}

export function setHighlightColor(s: Session, color: HighlightColor | undefined): Session {
  const next: Session = { ...latest(s) };
  if (color) next.highlightColor = color;
  else delete next.highlightColor;
  saveSession(next);
  return next;
}
