import { statSync } from "node:fs";
import { basename } from "node:path";
import { escapePath, imagePaths, replaceImagePaths } from "../core/images.ts";

export const SSH_BIN = () => process.env.YM_SSH_BIN ?? "ssh";
const TIMEOUT_MS = 30_000;

/** Copies a local file to the remote host and resolves to its remote path. */
export type Uploader = (localPath: string) => Promise<string>;

/** Names the remote copy; only characters that need no quoting in a shell or a pasted path. */
export const uploadName = (localPath: string, now = Date.now()) =>
  `${now}-${basename(localPath).replace(/[^A-Za-z0-9._-]+/g, "_")}`;

/** Runs on the remote host with the file on stdin. Wrapped in `sh -c` so the login shell can be fish. */
const uploadScript = (name: string) =>
  `sh -c 'umask 077; d="$HOME/.ym/uploads"; mkdir -p "$d" && find "$d" -type f -mtime +7 -delete 2>/dev/null; ` +
  `f="$d/${name}"; cat > "$f" && printf %s "$f"'`;

/**
 * Uploads through the ControlMaster socket of the running `ym ssh` connection. BatchMode keeps
 * ssh from prompting for a password on the terminal if the socket is gone.
 */
export function sshUploader(destination: string, controlPath: string): Uploader {
  return async (localPath) => {
    const proc = Bun.spawn(
      [
        SSH_BIN(), "-S", controlPath, "-T",
        "-o", "BatchMode=yes", "-o", "ClearAllForwardings=yes", "-o", "RemoteCommand=none",
        destination, uploadScript(uploadName(localPath)),
      ],
      { stdin: Bun.file(localPath), stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS },
    );
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (code !== 0 || !stdout) throw new Error(`ssh exited ${proc.signalCode ?? code}: ${stderr.trim()}`);
    return stdout;
  };
}

/** Uploads each file once per run, keyed by path, size and mtime so a replaced file goes again. */
export function cachedUploader(upload: Uploader): Uploader {
  const done = new Map<string, Promise<string>>();
  return (localPath) => {
    const { size, mtimeMs } = statSync(localPath);
    const key = `${localPath}\0${size}\0${mtimeMs}`;
    let remote = done.get(key);
    if (!remote) {
      remote = upload(localPath);
      remote.catch(() => done.delete(key));
      done.set(key, remote);
    }
    return remote;
  };
}

/** Swaps local image paths in pasted text for remote copies; paths whose upload fails stay as they were. */
export async function uploadImages(text: string, upload: Uploader, onError: (path: string, e: Error) => void): Promise<string> {
  const files = imagePaths(text);
  if (!files.length) return text;
  const remote = new Map<string, string>();
  await Promise.all(
    files.map(async (path) => {
      try {
        remote.set(path, await upload(path));
      } catch (e) {
        onError(path, e as Error);
      }
    }),
  );
  return replaceImagePaths(text, (path) => {
    const r = remote.get(path);
    return r && escapePath(r);
  });
}
