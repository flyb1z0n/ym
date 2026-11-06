import {
  accessSync,
  appendFileSync,
  chmodSync,
  constants,
  copyFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { updateLogFile, updatesDir, ymHome } from "./paths.ts";
import { isCompiled, VERSION } from "./self.ts";

const RELEASES = "https://github.com/flyb1z0n/ym/releases";
const releasesUrl = () => process.env.YM_UPDATE_URL ?? RELEASES;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const STAGED_PREFIX = "ym-";

/** A release binary downloaded to `path`, waiting to replace this one. */
export interface Update {
  version: string;
  path: string;
}

/** The release asset built for this machine, e.g. `ym-darwin-arm64`. */
export const assetName = (platform: string = process.platform, arch: string = process.arch) => `ym-${platform}-${arch}`;

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

/** Why this ym can't replace itself, or undefined when it can. */
export function updateBlocker(target = process.execPath): string | undefined {
  if (!isCompiled() || VERSION === "dev") return "this ym was built from source; pull and rebuild it instead";
  if (process.env.YM_NO_UPDATE) return "YM_NO_UPDATE is set";
  try {
    accessSync(dirname(target), constants.W_OK);
  } catch {
    return `${dirname(target)} isn't writable`;
  }
  return undefined;
}

export function logUpdate(message: string): void {
  try {
    mkdirSync(ymHome(), { recursive: true });
    appendFileSync(updateLogFile(), `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res;
}

export async function latestVersion(): Promise<string> {
  const version = (await (await fetchOk(`${releasesUrl()}/latest/download/version`)).text()).trim();
  if (!VERSION_RE.test(version)) throw new Error(`unexpected release version: ${version.slice(0, 40)}`);
  return version;
}

/** The newest downloaded release that is newer than `current`. */
export function stagedUpdate(current = VERSION): Update | undefined {
  let names: string[];
  try {
    names = readdirSync(updatesDir());
  } catch {
    return undefined;
  }
  let best: Update | undefined;
  for (const name of names) {
    const version = name.slice(STAGED_PREFIX.length);
    if (!name.startsWith(STAGED_PREFIX) || !VERSION_RE.test(version)) continue;
    if (compareVersions(version, current) <= 0) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { version, path: join(updatesDir(), name) };
  }
  return best;
}

/** Downloads `version` for this machine into the updates folder after checking it against the release's checksums. */
export async function downloadUpdate(version: string, asset = assetName()): Promise<Update> {
  const base = `${releasesUrl()}/download/v${version}`;
  const sums = await (await fetchOk(`${base}/checksums.txt`)).text();
  const expected = sums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name?.replace(/^\*/, "") === asset)?.[0];
  if (!expected) throw new Error(`release ${version} has no ${asset}`);
  const bytes = new Uint8Array(await (await fetchOk(`${base}/${asset}`)).arrayBuffer());
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== expected) {
    throw new Error(`${asset} ${version} doesn't match its checksum`);
  }
  mkdirSync(updatesDir(), { recursive: true });
  const path = join(updatesDir(), `${STAGED_PREFIX}${version}`);
  writeFileSync(`${path}.tmp`, bytes, { mode: 0o755 });
  renameSync(`${path}.tmp`, path);
  for (const name of readdirSync(updatesDir())) {
    if (name !== basename(path)) rmSync(join(updatesDir(), name), { force: true });
  }
  return { version, path };
}

/** Downloads the latest release if it's newer than this ym; resolves to the update waiting to be installed, if any. */
export async function checkForUpdate(current = VERSION): Promise<Update | undefined> {
  const latest = await latestVersion();
  const staged = stagedUpdate(current);
  if (staged && compareVersions(staged.version, latest) >= 0) return staged;
  if (compareVersions(latest, current) <= 0) return undefined;
  return downloadUpdate(latest);
}

/** Puts `update` in place of the binary at `target`; processes already running it keep the old one. */
export function installUpdate(update: Update, target = process.execPath): void {
  const tmp = `${target}.update-${process.pid}`;
  try {
    copyFileSync(update.path, tmp);
    chmodSync(tmp, 0o755);
    // Only a rename is safe: macOS kills a process whose signed binary is rewritten in place.
    renameSync(tmp, target);
  } finally {
    rmSync(tmp, { force: true });
  }
  rmSync(update.path, { force: true });
}
