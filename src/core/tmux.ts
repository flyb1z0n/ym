import type { PaneInfo } from "./types.ts";

export const SOCKET = () => process.env.YM_TMUX_SOCKET ?? "ym";
export const SESSION = "ym";
export const DASH_WINDOW = "dash";
export const DASH_KEY = () => process.env.YM_DASH_KEY ?? "C-g";

const DASH = `${SESSION}:=${DASH_WINDOW}`;
const UI_PANE = `${DASH}.0`;
const PLACEHOLDER_CMD = [
  "sh",
  "-c",
  'printf "\\n  Nothing running here.\\n  Select a running session, or press Enter on the left to start or resume one.\\n"; exec tail -f /dev/null',
];

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function cleanEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

export function tmux(args: string[]): RunResult {
  const p = Bun.spawnSync(["tmux", "-L", SOCKET(), ...args], { env: cleanEnv() });
  return { code: p.exitCode ?? 1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

function must(args: string[]): string {
  const r = tmux(args);
  if (r.code !== 0) throw new Error(`tmux ${args[0]} failed: ${r.stderr.trim() || r.code}`);
  return r.stdout;
}

const envArgs = (env: Record<string, string>) => Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);

export const hasTmux = () => Bun.which("tmux") !== null;

export const serverRunning = () => tmux(["has-session", "-t", `=${SESSION}`]).code === 0;

interface PaneRow {
  paneId: string;
  ymId: string;
  placeholder: boolean;
  dead: boolean;
  window: string;
  index: string;
}

/** All panes except the dashboard UI itself. */
function listPanes(): PaneRow[] {
  const r = tmux([
    "list-panes",
    "-s",
    "-t",
    `=${SESSION}`,
    "-F",
    "#{pane_id}\t#{@ym_id}\t#{@ym_placeholder}\t#{pane_dead}\t#{window_name}\t#{pane_index}",
  ]);
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [paneId = "", ymId = "", placeholder, dead, window = "", index = ""] = line.split("\t");
      return { paneId, ymId, placeholder: placeholder === "1", dead: dead === "1", window, index };
    })
    .filter((p) => !(p.window === DASH_WINDOW && p.index === "0"));
}

/** Agent panes by session id, wherever they currently live. */
export function listAgentPanes(): Map<string, PaneInfo> {
  const out = new Map<string, PaneInfo>();
  for (const p of listPanes()) {
    if (p.ymId) out.set(p.ymId, { paneId: p.paneId, dead: p.dead, shown: p.window === DASH_WINDOW });
  }
  return out;
}

/** Creates the ym server with the dashboard UI in the left pane of its first window. */
export function startServer(dashCommand: string[], cwd: string): void {
  must(["new-session", "-d", "-s", SESSION, "-n", DASH_WINDOW, "-c", cwd, ...dashCommand]);
  configureServer();
  ensureDashLayout(cwd);
}

export function configureServer(): void {
  // An escaped "\;" keeps both commands inside the binding; a bare ";" would end bind-key.
  must(["bind-key", "-n", DASH_KEY(), "select-window", "-t", DASH, "\\;", "select-pane", "-t", UI_PANE]);
  // Global options are safe here: the ym socket is a private tmux server.
  must(["set-option", "-g", "status-right", ` ${DASH_KEY()}: back to list `]);
  must(["set-option", "-g", "status-left", " ym "]);
  must(["set-option", "-g", "pane-active-border-style", "fg=green"]);
  // Keep panes after exit so an agent's final output stays visible; status treats it as exited.
  must(["set-option", "-g", "-w", "remain-on-exit", "on"]);
}

export const runningBuild = () => tmux(["show-option", "-gqv", "@ym_build"]).stdout.trim();
export const recordBuild = (id: string) => void tmux(["set-option", "-g", "@ym_build", id]);

/** Starts the dashboard UI if it's missing, dead, or running an older build. */
export function ensureDashWindow(dashCommand: string[], cwd: string, build: string): void {
  const windows = tmux(["list-windows", "-t", `=${SESSION}`, "-F", "#{window_name}"]).stdout.split("\n");
  if (!windows.includes(DASH_WINDOW)) {
    must(["new-window", "-d", "-t", `${SESSION}:`, "-n", DASH_WINDOW, "-c", cwd, ...dashCommand]);
  } else {
    const dead = tmux(["display-message", "-p", "-t", UI_PANE, "#{pane_dead}"]).stdout.trim() === "1";
    if (dead || runningBuild() !== build) must(["respawn-pane", "-k", "-t", UI_PANE, "-c", cwd, ...dashCommand]);
  }
  adoptLegacyPanes();
  ensureDashLayout(cwd);
}

/** Agent windows from builds before pane tagging are named after their session id. */
function adoptLegacyPanes(): void {
  for (const p of listPanes()) {
    if (!p.ymId && !p.placeholder && /^[a-f0-9]{8}$/.test(p.window)) {
      tmux(["set-option", "-p", "-t", p.paneId, "@ym_id", p.window]);
    }
  }
}

/** The dashboard window always has a right pane: the shown agent or the placeholder. */
export function ensureDashLayout(cwd: string): void {
  const panes = listPanes();
  if (panes.some((p) => p.window === DASH_WINDOW)) return;
  for (const p of panes.filter((x) => x.placeholder)) tmux(["kill-pane", "-t", p.paneId]);
  const paneId = must([
    "split-window", "-h", "-d", "-l", "60%", "-t", UI_PANE, "-c", cwd, "-P", "-F", "#{pane_id}", ...PLACEHOLDER_CMD,
  ]).trim();
  must(["set-option", "-p", "-t", paneId, "@ym_placeholder", "1"]);
}

const rightPane = () => listPanes().find((p) => p.window === DASH_WINDOW);

/** Moves the shown agent back to its own window. */
export function unshow(): void {
  const right = rightPane();
  if (!right || right.placeholder) return;
  const placeholder = listPanes().find((p) => p.placeholder);
  if (placeholder) must(["swap-pane", "-d", "-s", placeholder.paneId, "-t", right.paneId]);
}

/** Puts an agent pane on the right side of the dashboard. */
export function show(paneId: string): void {
  if (rightPane()?.paneId === paneId) return;
  unshow();
  const placeholder = rightPane();
  if (placeholder?.placeholder) must(["swap-pane", "-d", "-s", placeholder.paneId, "-t", paneId]);
}

export function focusRight(): void {
  const right = rightPane();
  if (right) must(["select-pane", "-t", right.paneId]);
}

export function selectDashboard(): void {
  must(["select-window", "-t", DASH]);
  must(["select-pane", "-t", UI_PANE]);
}

/** Replaces the current process's terminal with a client attached to the ym server. */
export function attach(): number {
  const p = Bun.spawnSync(["tmux", "-L", SOCKET(), "attach-session", "-t", `=${SESSION}`], {
    env: cleanEnv(),
    stdio: ["inherit", "inherit", "inherit"],
  });
  return p.exitCode ?? 0;
}

export interface AgentLaunch {
  id: string;
  cwd: string;
  env: Record<string, string>;
  command: string[];
}

/** Starts an agent in its own window and returns its pane id. */
export function newAgentPane(a: AgentLaunch): string {
  const paneId = must([
    "new-window", "-d", "-t", `${SESSION}:`, "-n", a.id, "-c", a.cwd, "-P", "-F", "#{pane_id}",
    ...envArgs(a.env), ...a.command,
  ]).trim();
  must(["set-option", "-p", "-t", paneId, "@ym_id", a.id]);
  return paneId;
}

export function respawnAgentPane(paneId: string, a: AgentLaunch): void {
  must(["respawn-pane", "-k", "-t", paneId, "-c", a.cwd, ...envArgs(a.env), ...a.command]);
}

export function killAgentPane(paneId: string): void {
  if (rightPane()?.paneId === paneId) unshow();
  tmux(["kill-pane", "-t", paneId]);
}

export function sendLine(paneId: string, text: string): void {
  must(["send-keys", "-t", paneId, "-l", text]);
  must(["send-keys", "-t", paneId, "Enter"]);
}

export function capturePane(paneId: string): string {
  const r = tmux(["capture-pane", "-p", "-J", "-t", paneId]);
  return r.code === 0 ? r.stdout : "";
}

export const detachClient = () => void tmux(["detach-client", "-s", SESSION]);
