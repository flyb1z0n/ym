import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = realpathSync(mkdtempSync(join(tmpdir(), "ym-ssh-")));
const remoteHome = join(dir, "remote home");
mkdirSync(remoteHome);
const shot = join(dir, "Screenshot 1.png");
writeFileSync(shot, "PNGDATA");
const stub = resolve(import.meta.dir, "stub-ssh.sh");
chmodSync(stub, 0o755);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const S = "\x1b[200~";
const E = "\x1b[201~";

/** Runs `ym ssh devbox` in a PTY whose "remote" program prints each pasted line visibly. */
function start(remoteCmd = "stty raw -echo; head -c 1 >/dev/null; echo ready; cat -v") {
  let out = "";
  const proc = Bun.spawn([process.execPath, resolve(import.meta.dir, "../../src/cli.tsx"), "ssh", "-p", "2222", "devbox"], {
    env: {
      ...process.env,
      HOME: remoteHome,
      YM_HOME: join(dir, "local"),
      YM_SSH_BIN: stub,
      YM_STUB_SSH_LOG: join(dir, "ssh-args"),
      YM_REMOTE_CMD: remoteCmd,
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

describe("ym ssh", () => {
  test("a dropped local image is uploaded and its remote path is what the remote side receives", async () => {
    const { proc, out } = start();
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

    const args = readFileSync(join(dir, "ssh-args"), "utf8").split("\n");
    expect(args[0]).toMatch(/^-t -o ControlPath=.+\.sock -o ControlMaster=auto -o RemoteCommand=none -p 2222 devbox /);
    expect(args[1]).toMatch(/^-S .+\.sock -T -o BatchMode=yes .* devbox sh -c /);

    proc.kill();
    await proc.exited;
  });

  test("remote line feeds reach the local terminal without an added carriage return", async () => {
    const { proc, out } = start("stty raw -echo; head -c 1 >/dev/null; printf 'one\\ntwo\\nend'; head -c 1 >/dev/null");
    proc.terminal!.write("go");
    await waitFor(out, /end/);
    expect(out()).toContain("one\ntwo\nend");

    proc.kill();
    await proc.exited;
  });
});
