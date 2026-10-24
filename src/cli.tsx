import { AGENTS, agentAvailable } from "./core/agents.ts";
import { runHook } from "./core/hook.ts";
import {
  codexHooksPath,
  hooksPath,
  hooksRegistered,
  install,
  installCodex,
  isInstalled,
  uninstall,
  uninstallCodex,
} from "./core/install.ts";
import { hookShimFile } from "./core/paths.ts";
import { buildId, selfCommand } from "./core/self.ts";
import { ensureDirs } from "./core/store.ts";
import * as tmux from "./core/tmux.ts";

const USAGE = `ym — dashboard for background Cursor and Codex agents

Usage:
  ym              open the dashboard (starts the ym tmux server if needed)
  ym install      register ym's status hooks in ~/.cursor/hooks.json and ~/.codex/hooks.json
  ym uninstall    remove ym's hooks from both
  ym hook <event> [codex]  internal: called by agent hooks
  ym dash         internal: run the dashboard UI in the current terminal

In the dashboard, type a prompt and press Enter to start an agent; Shift-Enter, Option-Enter, or
Ctrl-J adds a line break. The input starts with the
agent it will use (the default from settings, Cursor unless changed); Shift-Tab switches it.
Tag folders with @. Ctrl-T cycles how the list is grouped. Ctrl-/ shows every shortcut.
${tmux.DASH_KEY()} returns focus to the list from an agent pane or window.
Folders offered for @tags come from past sessions, agent chats, and YM_ROOTS (default ~/dev).`;

function fail(message: string): never {
  console.error(`ym: ${message}`);
  process.exit(1);
}

function insideYmServer(): boolean {
  const socketPath = process.env.TMUX?.split(",")[0] ?? "";
  return socketPath.endsWith(`/${tmux.SOCKET()}`);
}

function open(): void {
  if (!tmux.hasTmux()) fail("tmux is not installed (brew install tmux).");
  if (!AGENTS.some(agentAvailable)) {
    fail("neither Cursor CLI `agent` (https://cursor.com/cli) nor Codex CLI `codex` is on PATH.");
  }
  ensureDirs();
  if (!isInstalled(selfCommand())) {
    console.error("ym: status hooks are not installed; sessions will show as working. Run `ym install`.");
  }
  const dash = [...selfCommand(), "dash"];
  if (!tmux.serverRunning()) {
    tmux.startServer(dash, process.cwd());
  } else {
    tmux.configureServer();
    tmux.ensureDashWindow(dash, process.cwd(), buildId());
  }
  tmux.selectDashboard();
  if (insideYmServer()) return;
  if (process.env.TMUX) console.error("ym: opening inside your tmux session as a nested client.");
  process.exit(tmux.attach());
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case undefined:
  case "open":
    open();
    break;
  case "dash": {
    const { runDashboard } = await import("./ui/run.tsx");
    await runDashboard();
    break;
  }
  case "hook":
    await runHook(args[0] ?? "", args[1]);
    break;
  case "install": {
    try {
      const wasRegistered = hooksRegistered();
      const commands = install(selfCommand());
      console.log(`Installed ${commands.length} hooks in ${hooksPath()}, running ${hookShimFile()}:`);
      for (const c of commands) console.log(`  ${c}`);
      if (!wasRegistered) console.log("Restart running Cursor agents for the hooks to take effect.");
      const codex = installCodex(selfCommand());
      if (codex) {
        console.log(`\nInstalled ${codex.length} hooks in ${codexHooksPath()}:`);
        for (const c of codex) console.log(`  ${c}`);
        console.log("Codex asks you to trust new hooks once: pick \"Trust all and continue\" or use /hooks.");
      }
    } catch (e) {
      fail((e as Error).message);
    }
    break;
  }
  case "uninstall": {
    // Codex first: the Cursor uninstall forgets the list of commands ym installed.
    const codex = uninstallCodex();
    console.log(`Removed ${uninstall()} ym hooks from ${hooksPath()}.`);
    if (codex) console.log(`Removed ${codex} ym hooks from ${codexHooksPath()}.`);
    break;
  }
  case "help":
  case "-h":
  case "--help":
    console.log(USAGE);
    break;
  default:
    console.error(USAGE);
    process.exit(1);
}
