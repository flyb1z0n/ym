import { render } from "ink";
import { hasCodex } from "../core/codex.ts";
import { isCodexInstalled, isInstalled } from "../core/install.ts";
import { buildId, selfCommand } from "../core/self.ts";
import { ensureDirs } from "../core/store.ts";
import { recordBuild } from "../core/tmux.ts";
import { App } from "./App.tsx";

export async function runDashboard(): Promise<void> {
  ensureDirs();
  recordBuild(buildId());
  const self = selfCommand();
  const app = render(
    <App hooksInstalled={isInstalled(self)} codexHooksInstalled={!hasCodex() || isCodexInstalled(self)} />,
    { exitOnCtrlC: false },
  );
  await app.waitUntilExit();
}
