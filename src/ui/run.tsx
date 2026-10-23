import { render } from "ink";
import { hasCodex } from "../core/codex.ts";
import { isCodexInstalled, isInstalled } from "../core/install.ts";
import { buildId, selfCommand } from "../core/self.ts";
import { ensureDirs } from "../core/store.ts";
import { csiUKeys, recordBuild } from "../core/tmux.ts";
import { App } from "./App.tsx";

/** xterm modifyOtherKeys mode 1: only keys that are otherwise ambiguous, like Shift-Enter, arrive extended. */
const EXTENDED_KEYS_ON = "\x1b[>4;1m";
const EXTENDED_KEYS_OFF = "\x1b[>4;0m";

export async function runDashboard(): Promise<void> {
  ensureDirs();
  recordBuild(buildId());
  const self = selfCommand();
  // Only CSI u is safe to ask for: Ink can't parse the xterm format and would type it into the prompt.
  const extendedKeys = !!process.env.TMUX && csiUKeys();
  if (extendedKeys) process.stdout.write(EXTENDED_KEYS_ON);
  const app = render(
    <App hooksInstalled={isInstalled(self)} codexHooksInstalled={!hasCodex() || isCodexInstalled(self)} />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
  if (extendedKeys) process.stdout.write(EXTENDED_KEYS_OFF);
}
