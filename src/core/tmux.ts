import type { WindowInfo } from "./types.ts";

export const SOCKET = () => process.env.YM_TMUX_SOCKET ?? "ym";
export const SESSION = "ym";
export const DASH_WINDOW = "dash";
export const DASH_KEY = () => process.env.YM_DASH_KEY ?? "C-g";

const target = (window: string) => `${SESSION}:=${window}`;

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

export const hasTmux = () => Bun.which("tmux") !== null;

export const serverRunning = () => tmux(["has-session", "-t", `=${SESSION}`]).code === 0;

export function listWindows(): Map<string, WindowInfo> {
  const out = new Map<string, WindowInfo>();
  const r = tmux(["list-windows", "-t", `=${SESSION}`, "-F", "#{window_name}\t#{pane_dead}"]);
  if (r.code !== 0) return out;
  for (const line of r.stdout.split("\n")) {
    const [name, dead] = line.split("\t");
    if (name) out.set(name, { name, dead: dead === "1" });
  }
  return out;
}

/** Creates the ym server with the dashboard in its first window. */
export function startServer(dashCommand: string[], cwd: string): void {
  must(["new-session", "-d", "-s", SESSION, "-n", DASH_WINDOW, "-c", cwd, ...dashCommand]);
  configureServer();
}

export function configureServer(): void {
  must(["bind-key", "-n", DASH_KEY(), "select-window", "-t", target(DASH_WINDOW)]);
  // Global options are safe here: the ym socket is a private tmux server.
  must(["set-option", "-g", "status-right", ` ${DASH_KEY()}: dashboard `]);
  must(["set-option", "-g", "status-left", " ym "]);
  // Keep panes after exit so an agent's final output stays visible; status treats it as exited.
  must(["set-option", "-g", "-w", "remain-on-exit", "on"]);
}

export function ensureDashWindow(dashCommand: string[], cwd: string): void {
  const dash = listWindows().get(DASH_WINDOW);
  if (!dash) {
    must(["new-window", "-d", "-t", `${SESSION}:`, "-n", DASH_WINDOW, "-c", cwd, ...dashCommand]);
  } else if (dash.dead) {
    must(["respawn-window", "-k", "-t", target(DASH_WINDOW), "-c", cwd, ...dashCommand]);
  }
}

/** Replaces the current process's terminal with a client attached to the ym server. */
export function attach(): number {
  const p = Bun.spawnSync(["tmux", "-L", SOCKET(), "attach-session", "-t", `=${SESSION}`], {
    env: cleanEnv(),
    stdio: ["inherit", "inherit", "inherit"],
  });
  return p.exitCode ?? 0;
}

export interface NewWindow {
  name: string;
  cwd: string;
  env: Record<string, string>;
  command: string[];
}

export function newWindow(w: NewWindow): void {
  const envArgs = Object.entries(w.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  must(["new-window", "-d", "-t", `${SESSION}:`, "-n", w.name, "-c", w.cwd, ...envArgs, ...w.command]);
}

export const selectWindow = (name: string) => must(["select-window", "-t", target(name)]);

export const killWindow = (name: string) => void tmux(["kill-window", "-t", target(name)]);

export function sendLine(name: string, text: string): void {
  must(["send-keys", "-t", target(name), "-l", text]);
  must(["send-keys", "-t", target(name), "Enter"]);
}

export function capturePane(name: string): string {
  const r = tmux(["capture-pane", "-p", "-t", target(name)]);
  return r.code === 0 ? r.stdout : "";
}

export const detachClient = () => void tmux(["detach-client", "-s", SESSION]);
