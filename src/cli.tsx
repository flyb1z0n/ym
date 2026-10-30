import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENTS, agentAvailable } from "./core/agents.ts";
import { folderRoots } from "./core/folders.ts";
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
import { loadSettings, saveSettings } from "./core/settings.ts";
import { ensureDirs } from "./core/store.ts";
import * as tmux from "./core/tmux.ts";

const USAGE = `ym — dashboard for background Cursor and Codex agents

Usage:
  ym              open the dashboard (starts the ym tmux server if needed)
  ym install      register ym's status hooks in ~/.cursor/hooks.json and ~/.codex/hooks.json
  ym uninstall    remove ym's hooks from both
  ym ssh [ssh options] <host>  open ym on <host> over ssh; images dropped on this terminal are uploaded
  ym ssh          pick a host you connected to before
  ym hook <event> [codex]  internal: called by agent hooks
  ym dash         internal: run the dashboard UI in the current terminal

In the dashboard, type a prompt and press Enter to start an agent; Shift-Enter, Option-Enter, or
Ctrl-J adds a line break. The input starts with the
agent it will use (the default from settings, Cursor unless changed); Shift-Tab switches it among
the agents turned on in settings.
ym and its sessions start in your dev directory, the folder that contains all your repositories;
the first \`ym\` asks for it, and settings (Ctrl-S) can change it. Tag folders with @ to point the
agent at them.
Ctrl-T cycles how the list is grouped. Ctrl-/ shows every shortcut.
${tmux.keyLabel(tmux.DASH_KEY())} returns focus to the list from an agent pane or window.
Folders offered for @tags come from past sessions, agent chats, and YM_ROOTS (default ~/dev).`;

function fail(message: string): never {
  console.error(`ym: ${message}`);
  process.exit(1);
}

function insideYmServer(): boolean {
  const socketPath = process.env.TMUX?.split(",")[0] ?? "";
  return socketPath.endsWith(`/${tmux.SOCKET()}`);
}

/** The saved dev directory, or the one the user picks now, which is saved for next time. */
async function devDir(): Promise<string> {
  const settings = loadSettings();
  const saved = settings.devDir;
  if (saved && existsSync(saved)) return saved;
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail("ym needs a terminal to ask for your dev directory.");
  const { askDevDir } = await import("./ui/DevDirPrompt.tsx");
  const { tildify } = await import("./ui/format.ts");
  const dir = await askDevDir(tildify(saved ?? folderRoots()[0] ?? join(homedir(), "dev")), saved);
  if (!dir) process.exit(0);
  saveSettings({ ...settings, devDir: dir });
  return dir;
}

async function open(): Promise<void> {
  if (!tmux.hasTmux()) fail("tmux is not installed (brew install tmux).");
  if (!AGENTS.some(agentAvailable)) {
    fail("neither Cursor CLI `agent` (https://cursor.com/cli) nor Codex CLI `codex` is on PATH.");
  }
  ensureDirs();
  if (!isInstalled(selfCommand())) {
    console.error("ym: status hooks are not installed; sessions will show as working. Run `ym install`.");
  }
  const cwd = await devDir();
  const dash = [...selfCommand(), "dash"];
  if (!tmux.serverRunning()) {
    tmux.startServer(dash, cwd);
  } else {
    tmux.configureServer();
    tmux.ensureDashWindow(dash, cwd, buildId());
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
    await open();
    break;
  case "dash": {
    const { runDashboard } = await import("./ui/run.tsx");
    await runDashboard();
    break;
  }
  case "hook":
    await runHook(args[0] ?? "", args[1]);
    break;
  case "ssh": {
    const { runSsh } = await import("./ssh/client.ts");
    try {
      let sshArgs: string[] | undefined = args;
      if (sshArgs.length === 0) {
        const { loadHosts } = await import("./ssh/hosts.ts");
        const hosts = loadHosts();
        if (hosts.length === 0) fail("usage: ym ssh [ssh options] <host> (no saved hosts yet)");
        if (!process.stdin.isTTY || !process.stdout.isTTY) fail("ym ssh needs a terminal.");
        const { pickHost } = await import("./ui/SshHostPicker.tsx");
        sshArgs = await pickHost(hosts);
        if (!sshArgs) process.exit(0);
      }
      process.exit(await runSsh(sshArgs));
    } catch (e) {
      fail((e as Error).message);
    }
  }
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
