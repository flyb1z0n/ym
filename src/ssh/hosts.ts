import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ymHome } from "../core/paths.ts";

/** A `ym ssh` invocation that connected: its ssh options with the destination last. */
export interface SshHost {
  args: string[];
  lastUsed: number;
}

export const sshHostsFile = () => join(ymHome(), "ssh-hosts.json");

const sameArgs = (a: string[], b: string[]) => a.length === b.length && a.every((arg, i) => arg === b[i]);

const isHost = (value: unknown): value is SshHost => {
  const host = value as SshHost;
  return (
    Array.isArray(host?.args) &&
    host.args.length > 0 &&
    host.args.every((arg) => typeof arg === "string") &&
    typeof host.lastUsed === "number"
  );
};

/** Saved hosts, most recently used first. */
export function loadHosts(): SshHost[] {
  try {
    const value = JSON.parse(readFileSync(sshHostsFile(), "utf8")) as unknown;
    return Array.isArray(value) ? value.filter(isHost).sort((a, b) => b.lastUsed - a.lastUsed) : [];
  } catch {
    return [];
  }
}

function saveHosts(hosts: SshHost[]): void {
  mkdirSync(ymHome(), { recursive: true });
  const path = sshHostsFile();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(hosts, null, 2));
  renameSync(tmp, path);
}

export function rememberHost(args: string[], now = Date.now()): void {
  saveHosts([{ args, lastUsed: now }, ...loadHosts().filter((h) => !sameArgs(h.args, args))]);
}

export function forgetHost(args: string[]): void {
  saveHosts(loadHosts().filter((h) => !sameArgs(h.args, args)));
}

/** ssh flags that take a value, from ssh(1). */
const FLAGS_WITH_VALUE = new Set("BbcDEeFIiJLlmOoPpQRSWw");

/** Index of the destination: the first argument that isn't an option or an option's value. */
function destinationIndex(args: string[]): number {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") return i + 1 < args.length ? i + 1 : -1;
    if (!arg.startsWith("-") || arg === "-") return i;
    for (let j = 1; j < arg.length; j++) {
      if (!FLAGS_WITH_VALUE.has(arg[j]!)) continue;
      if (j === arg.length - 1) i++;
      break;
    }
  }
  return -1;
}

/** The destination and the ssh options around it, for display. ssh also takes options after the destination. */
export function describeHost(args: string[]): { destination: string; options: string } {
  const at = destinationIndex(args);
  if (at < 0) return { destination: args.at(-1) ?? "", options: args.slice(0, -1).join(" ") };
  return { destination: args[at]!, options: args.filter((_, i) => i !== at).join(" ") };
}
