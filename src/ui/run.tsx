import { render } from "ink";
import { isInstalled } from "../core/install.ts";
import { selfCommand } from "../core/self.ts";
import { ensureDirs } from "../core/store.ts";
import { App } from "./App.tsx";

export async function runDashboard(): Promise<void> {
  ensureDirs();
  const app = render(<App hooksInstalled={isInstalled(selfCommand())} />, { exitOnCtrlC: false });
  await app.waitUntilExit();
}
