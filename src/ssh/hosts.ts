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

/** The destination and the ssh options before it, for display. */
export function describeHost(args: string[]): { destination: string; options: string } {
  return { destination: args.at(-1) ?? "", options: args.slice(0, -1).join(" ") };
}
