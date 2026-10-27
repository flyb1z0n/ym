# ym — dropping images over SSH

Status: implemented. Date: 2026-10-27.

## Goal

Drag an image from the Mac onto a terminal running a remote `ym`, and have it attach
as `[Image #N]` (or in the focused Cursor/Codex pane) just like it does locally.

## Problem

A terminal handles a file drop by pasting the file's local path. Over SSH that path
names a file on the wrong machine, so `attachPastedImages` leaves it as plain text.
The terminal is the only program that can read the file, and the remote side can't
ask it to (iTerm2 has no protocol for that; kitty's OSC 72 does, but tmux filters it).

## Decisions

| Topic | Decision |
|---|---|
| Where | A local `ym ssh [ssh options] <host>` on the Mac wraps `ssh`; the remote `ym` is unchanged |
| Terminal | Any terminal with bracketed paste; nothing iTerm2- or kitty-specific |
| What is uploaded | Pasted tokens that `resolveImage` accepts locally (same rules as the dashboard) |
| Transport | The same SSH connection, shared through a ControlMaster socket under `~/.ym/ssh` |
| Destination | `~/.ym/uploads/<timestamp>-<safe name>` on the remote, owner-only; files older than 7 days are pruned on upload |
| Failure | The paste goes through unchanged; the reason goes to `~/.ym/ssh.log` |
| Out of scope | Cmd-V clipboard screenshots, non-image files, Windows |

## How it works

```text
Mac                                                         remote
┌──────────┐ keys + pastes  ┌───────────────────┐  ssh -t   ┌──────────────────────┐
│ terminal │───────────────▶│ ym ssh <host>     │──────────▶│ ym → tmux → dashboard│
│          │◀───────────────│ (local PTY proxy) │◀──────────│        / agent panes │
└──────────┘ screen output  └─────────┬─────────┘           └──────────────────────┘
                                      │ ssh -S <socket> <host> 'cat > …'
                                      └────────────────────▶ ~/.ym/uploads/<file>
```

`ym ssh` runs `ssh -t <host> 'exec "$SHELL" -lc ym'` (`YM_REMOTE_CMD` overrides the
command) inside a `Bun.Terminal` PTY, with the local terminal in raw mode. Output,
keys, and resizes pass through untouched; only bracketed pastes are inspected.

A drop:

1. The terminal sends `ESC[200~/Users/me/shot.png ESC[201~`. Bracketed paste is on
   because remote tmux turns it on when the focused pane asks for it.
2. `PasteRewriter` holds the bytes between the markers, even when they arrive across
   several reads. Input that arrives meanwhile is queued behind it, so order is kept.
3. Each local image in the paste is uploaded through the control socket: the file is
   the stdin of `sh -c '… cat > "$f" && printf %s "$f"'`, which prints the remote path.
4. The paste is forwarded with remote paths (escaped like `promptPastes` does), so the
   remote dashboard or agent sees a path that exists.

Edge cases:

- A lone `ESC` could be the start of a paste marker; it is held for 10 ms, then sent.
- A paste with no end marker is forwarded as is after 1 s without input.
- The same file (path, size, mtime) is uploaded once per `ym ssh` run.
- Uploads use `BatchMode=yes`, so a missing master fails instead of prompting on the
  terminal, and time out after 30 s.

## Modules

- `src/ssh/pastes.ts`: `PasteRewriter`, the byte-stream parser.
- `src/ssh/upload.ts`: `sshUploader`, and `uploadImages` which rewrites a paste.
- `src/ssh/client.ts`: `runSsh`, the PTY proxy.
- `src/core/images.ts`: `imagePaths`, `replaceImagePaths`, `escapePath`, shared with the
  dashboard.

## Testing

- Unit: marker parsing across chunk boundaries, ordering while a rewrite is pending,
  the ESC and unterminated-paste timeouts, paste rewriting with a fake uploader.
- Integration: `ym ssh` in a PTY with a stub `ssh` (`YM_SSH_BIN`) that runs the remote
  command locally; a dropped image arrives in `~/.ym/uploads` and its path reaches the
  remote program.
