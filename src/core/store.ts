import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { eventsDir, eventsFile, sessionFile, sessionsDir } from "./paths.ts";
import type { HookEvent, Session } from "./types.ts";

export const SESSION_ID_RE = /^[a-f0-9]{8}$/;

export function newSessionId(): string {
  return randomBytes(4).toString("hex");
}

export function ensureDirs(): void {
  mkdirSync(sessionsDir(), { recursive: true });
  mkdirSync(eventsDir(), { recursive: true });
}

export function listSessions(): Session[] {
  if (!existsSync(sessionsDir())) return [];
  const out: Session[] = [];
  for (const f of readdirSync(sessionsDir())) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(`${sessionsDir()}/${f}`, "utf8")) as Session);
    } catch {
      // Skip unreadable or half-written files.
    }
  }
  return out;
}

export function loadSession(id: string): Session | undefined {
  try {
    return JSON.parse(readFileSync(sessionFile(id), "utf8")) as Session;
  } catch {
    return undefined;
  }
}

export function saveSession(s: Session): void {
  ensureDirs();
  const path = sessionFile(s.id);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, path);
}

export function deleteSession(id: string): void {
  rmSync(sessionFile(id), { force: true });
  rmSync(eventsFile(id), { force: true });
}

/** Must stay a single short line: appends below PIPE_BUF are atomic. */
export function appendEvent(id: string, ev: HookEvent): void {
  mkdirSync(eventsDir(), { recursive: true });
  appendFileSync(eventsFile(id), `${JSON.stringify(ev)}\n`);
}

export function parseEventLines(text: string): { events: HookEvent[]; consumed: number } {
  const events: HookEvent[] = [];
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1) return { events, consumed: 0 };
  const complete = text.slice(0, lastNewline);
  for (const line of complete.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as HookEvent);
    } catch {
      // Corrupt line: ignore.
    }
  }
  return { events, consumed: Buffer.byteLength(complete, "utf8") + 1 };
}

/** Reads only the events appended since the previous call, per session. */
export class EventReader {
  private offsets = new Map<string, number>();

  read(id: string): HookEvent[] {
    const path = eventsFile(id);
    if (!existsSync(path)) return [];
    const offset = this.offsets.get(id) ?? 0;
    const fd = openSync(path, "r");
    try {
      const size = fstatSync(fd).size;
      if (size < offset) {
        this.offsets.set(id, 0);
        return this.read(id);
      }
      if (size === offset) return [];
      const buf = Buffer.alloc(size - offset);
      readSync(fd, buf, 0, buf.length, offset);
      const { events, consumed } = parseEventLines(buf.toString("utf8"));
      this.offsets.set(id, offset + consumed);
      return events;
    } finally {
      closeSync(fd);
    }
  }

  forget(id: string): void {
    this.offsets.delete(id);
  }
}
