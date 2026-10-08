import { hasAgent } from "./core/cursor.ts";
import { runHook } from "./core/hook.ts";
import { hooksPath, install, isInstalled, uninstall } from "./core/install.ts";
import { buildId, selfCommand } from "./core/self.ts";
import { ensureDirs } from "./core/store.ts";
import * as tmux from "./core/tmux.ts";

const USAGE = `ym — dashboard for background Cursor agents

Usage:
  ym              open the dashboard (starts the ym tmux server if needed)
  ym install      register ym's status hooks in ~/.cursor/hooks.json
  ym uninstall    remove ym's hooks from ~/.cursor/hooks.json
  ym hook <event> internal: called by Cursor hooks
  ym dash         internal: run the dashboard UI in the current terminal

In the dashboard, type a prompt (tag folders with @) and press Enter to start Cursor.
${tmux.DASH_KEY()} returns focus to the list from an agent pane or window.
Folders offered for @tags come from past sessions, Cursor chats, and YM_ROOTS (default ~/dev).`;

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
  if (!hasAgent()) fail("Cursor CLI `agent` not found on PATH (https://cursor.com/cli).");
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
    await runHook(args[0] ?? "");
    break;
  case "install": {
    try {
      const commands = install(selfCommand());
      console.log(`Installed ${commands.length} hooks in ${hooksPath()}:`);
      for (const c of commands) console.log(`  ${c}`);
      console.log("Restart running Cursor agents for the hooks to take effect.");
    } catch (e) {
      fail((e as Error).message);
    }
    break;
  }
  case "uninstall":
    console.log(`Removed ${uninstall()} ym hooks from ${hooksPath()}.`);
    break;
  case "help":
  case "-h":
  case "--help":
    console.log(USAGE);
    break;
  default:
    console.error(USAGE);
    process.exit(1);
}
