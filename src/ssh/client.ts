import { appendFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ymHome } from "../core/paths.ts";
import { rememberHost } from "./hosts.ts";
import { PasteRewriter } from "./pastes.ts";
import { SSH_BIN, cachedUploader, sshUploader, uploadImages } from "./upload.ts";

/** What runs on the remote host; a login shell so `~/.local/bin` is on PATH. */
export const remoteCommand = () => process.env.YM_REMOTE_CMD ?? `exec "$SHELL" -lc ym`;
export const sshLogFile = () => join(ymHome(), "ssh.log");

function log(message: string): void {
  try {
    appendFileSync(sshLogFile(), `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

/**
 * Runs the remote `ym` over ssh inside a PTY, uploading images dropped on the local terminal
 * so the remote side gets paths that exist there. `args` are ssh's, destination last.
 */
export async function runSsh(args: string[]): Promise<number> {
  const destination = args.at(-1);
  if (!destination || destination.startsWith("-")) throw new Error("usage: ym ssh [ssh options] <host>");
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("ym ssh needs a terminal.");

  // Short path: macOS caps unix socket paths at 104 bytes, and ssh adds a suffix while creating it.
  const socketDir = join(ymHome(), "ssh");
  mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  const controlPath = join(socketDir, `${process.pid}.sock`);
  rmSync(controlPath, { force: true });

  const upload = cachedUploader(sshUploader(destination, controlPath));
  let closed: () => void = () => {};
  const ptyClosed = new Promise<void>((resolve) => (closed = resolve));
  const proc = Bun.spawn(
    [
      SSH_BIN(), "-t",
      "-o", `ControlPath=${controlPath}`, "-o", "ControlMaster=auto", "-o", "RemoteCommand=none",
      ...args, remoteCommand(),
    ],
    {
      terminal: {
        cols: stdout.columns,
        rows: stdout.rows,
        name: process.env.TERM,
        data: (_t, data) => stdout.write(data),
        exit: () => closed(),
      },
    },
  );
  const pty = proc.terminal!;
  const pastes = new PasteRewriter(
    (data) => pty.write(data),
    (text) => uploadImages(text, upload, (path, e) => log(`upload failed for ${path}: ${e.message}`)),
  );
  // Strings when the host picker ran first: Ink sets stdin's encoding, and that can't be undone.
  const onInput = (chunk: Buffer | string) => pastes.feed(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const onResize = () => pty.resize(stdout.columns, stdout.rows);
  // The control socket appears once ssh has connected and authenticated, so typos aren't remembered.
  const remember = setInterval(() => {
    if (!existsSync(controlPath)) return;
    clearInterval(remember);
    try {
      rememberHost(args);
    } catch (e) {
      log(`could not save ${args.join(" ")}: ${(e as Error).message}`);
    }
  }, 250);

  stdin.setRawMode(true);
  // setRawMode keeps output processing, which turns the bare line feeds tmux uses to move the
  // cursor down into CR LF and garbles the remote screen; ssh itself turns it off too.
  Bun.spawnSync(["stty", "-opost"], { stdin: "inherit" });
  stdin.on("data", onInput);
  process.on("SIGWINCH", onResize);
  try {
    const code = await proc.exited;
    await Promise.race([ptyClosed, Bun.sleep(500)]);
    return code;
  } finally {
    clearInterval(remember);
    process.off("SIGWINCH", onResize);
    stdin.off("data", onInput);
    stdin.setRawMode(false);
    stdin.pause();
    pty.close();
    rmSync(controlPath, { force: true });
  }
}
