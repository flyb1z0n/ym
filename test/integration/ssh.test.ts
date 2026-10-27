import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-ssh-")));
const remoteHome = join(dir, "remote home");
mkdirSync(remoteHome);
const shot = join(dir, "Screenshot 1.png");
writeFileSync(shot, "PNGDATA");
const stub = resolve(import.meta.dir, "stub-ssh.sh");
chmodSync(stub, 0o755);
const localHome = join(dir, "local");
const hostsFile = join(localHome, "ssh-hosts.json");
const argsLog = join(dir, "ssh-args");
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  rmSync(localHome, { recursive: true, force: true });
  rmSync(argsLog, { force: true });
});

const S = "\x1b[200~";
const E = "\x1b[201~";
const READY_CMD = "stty raw -echo; head -c 1 >/dev/null; echo ready; cat -v";

/** Runs `ym ssh <args>` in a PTY, with `remoteCmd` as what the stub ssh runs "remotely". */
function start(args: string[], remoteCmd = READY_CMD, env: Record<string, string> = {}) {
  let out = "";
  const proc = Bun.spawn([process.execPath, resolve(import.meta.dir, "../../src/cli.tsx"), "ssh", ...args], {
    env: {
      ...process.env,
      HOME: remoteHome,
      YM_HOME: localHome,
      YM_SSH_BIN: stub,
      YM_STUB_SSH_LOG: argsLog,
      YM_REMOTE_CMD: remoteCmd,
      ...env,
    },
    terminal: { cols: 200, rows: 24, data: (_t, d) => (out += Buffer.from(d).toString()) },
  });
  return { proc, out: () => out };
}

async function waitFor(get: () => string, want: RegExp, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (want.test(get())) return;
    await Bun.sleep(50);
  }
  throw new Error(`never saw ${want} in ${JSON.stringify(get())}`);
}

const savedArgs = () => (existsSync(hostsFile) ? readFileSync(hostsFile, "utf8") : "");
const hosts = () => (JSON.parse(readFileSync(hostsFile, "utf8")) as { args: string[] }[]).map((h) => h.args);

describe("ym ssh", () => {
  test("a dropped local image is uploaded and its remote path is what the remote side receives", async () => {
    const { proc, out } = start(["-p", "2222", "devbox"]);
    const pty = proc.terminal!;
    pty.write("go");
    await waitFor(out, /ready/);
    pty.write(`${S}${shot.replace(/ /g, "\\ ")}${E}`);
    await waitFor(out, /201~/);

    const uploads = join(remoteHome, ".ym", "uploads");
    const [name] = readdirSync(uploads);
    expect(name).toMatch(/^\d+-Screenshot_1\.png$/);
    expect(readFileSync(join(uploads, name!), "utf8")).toBe("PNGDATA");
    expect(out()).toContain(`^[[200~${join(uploads, name!).replace(/ /g, "\\ ")}^[[201~`);
    expect(out()).not.toContain("Screenshot\\ 1.png");

    const args = readFileSync(argsLog, "utf8").split("\n");
    expect(args[0]).toMatch(/^-t -o ControlPath=.+\.sock -o ControlMaster=auto -o RemoteCommand=none -p 2222 devbox /);
    expect(args[1]).toMatch(/^-S .+\.sock -T -o BatchMode=yes .* devbox sh -c /);

    proc.kill();
    await proc.exited;
  });

  test("a host is remembered with its options once ssh connects", async () => {
    const { proc } = start(["-p", "2222", "devbox"]);
    await waitFor(savedArgs, /devbox/);
    expect(hosts()).toEqual([["-p", "2222", "devbox"]]);
    proc.kill();
    await proc.exited;
  });

  test("a host ssh never connects to is not remembered", async () => {
    const { proc } = start(["typo-host"], "sleep 0.6", { YM_STUB_SSH_NO_MASTER: "1" });
    await proc.exited;
    expect(savedArgs()).toBe("");
  });

  test("plain ym ssh lists saved hosts, most recent first, and connects to the picked one", async () => {
    mkdirSync(localHome, { recursive: true });
    writeFileSync(
      hostsFile,
      JSON.stringify([
        { args: ["-p", "2222", "older"], lastUsed: 1 },
        { args: ["newer"], lastUsed: 2 },
      ]),
    );
    const { proc, out } = start([]);
    await waitFor(out, /older/);
    expect(out().indexOf("newer")).toBeLessThan(out().indexOf("older"));

    const pty = proc.terminal!;
    pty.write("\x1b[B");
    await Bun.sleep(100);
    pty.write("\r");
    await Bun.sleep(300);
    pty.write("go");
    await waitFor(out, /ready/);

    expect(readFileSync(argsLog, "utf8").split("\n")[0]).toMatch(/RemoteCommand=none -p 2222 older /);
    await waitFor(() => JSON.stringify(hosts()[0]), /older/);
    expect(hosts()).toEqual([["-p", "2222", "older"], ["newer"]]);
    proc.kill();
    await proc.exited;
  });

  test("plain ym ssh with nothing saved explains the usage", async () => {
    const { proc, out } = start([]);
    expect(await proc.exited).toBe(1);
    expect(out()).toContain("no saved hosts yet");
  });
});
