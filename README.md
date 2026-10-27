# ym (YesMaster)

`ym` is a terminal dashboard for running and monitoring multiple background Cursor CLI (`agent`) and Codex CLI (`codex`) sessions.

It uses a dedicated tmux server (`tmux -L ym`) to keep one dashboard pane plus one pane/window per session, with live status and quick switching.

## Features

- Start and monitor many Cursor and Codex sessions from one TUI.
- See session states (`working`, `ready`, `stopped`, `imported`, etc.) in real time via each agent's hooks.
- Jump into a running session pane instantly, then return to the dashboard.
- Launch prompts from the dashboard with `@folder` tags; `Shift-Tab` picks the agent.
- Import past Cursor chats and Codex sessions and resume them.
- Optional worktrees for new sessions (Cursor-managed for Cursor, ym-managed under `~/.ym/worktrees` for Codex).

## Requirements

- [Bun](https://bun.sh)
- [tmux](https://github.com/tmux/tmux/wiki)
- [Cursor CLI `agent`](https://cursor.com/cli) and/or [Codex CLI `codex`](https://developers.openai.com/codex/cli) on your `PATH`
- macOS (notifications use `osascript`)

## Install

From the repo root:

```bash
bun run setup
```

This script:

- installs dependencies
- builds `dist/ym`
- links `ym` into `~/.local/bin` (or `YM_BIN_DIR` if set)
- runs `ym install` to register status hooks in `~/.cursor/hooks.json` and, if Codex is set up, `~/.codex/hooks.json` (plus one trusted-folder entry for `~/.ym/worktrees` in `~/.codex/config.toml`)

Codex runs new hooks only after you trust them: the first Codex session shows "Hooks need review"; pick "Trust all and continue" (or use `/hooks`).

If `~/.local/bin` is not on your `PATH`, add it in your shell profile.

## Usage

```bash
ym
```

CLI commands:

- `ym` - open dashboard (starts/attaches to the `ym` tmux server)
- `ym install` - register hooks (Cursor and Codex)
- `ym uninstall` - remove hooks (Cursor and Codex)
- `ym ssh [ssh options] <host>` - open `ym` on a remote machine (see below); plain `ym ssh` picks a saved host
- `ym help` - show help

## Over SSH

Dropping an image on the terminal pastes its local path, which doesn't exist on a remote machine. Run `ym ssh <host>` on your laptop instead of `ssh <host>` and then `ym`: it runs the remote `ym` over `ssh`, uploads each image you drop to `~/.ym/uploads` on the remote (over the same connection), and pastes the remote path, so it attaches as `[Image #N]` as it would locally. It works in any terminal with bracketed paste, and in agent panes too.

- `ym` must be installed on both machines; the remote one is started with `"$SHELL" -lc ym` (override with `YM_REMOTE_CMD`).
- Options before the host go to `ssh` (e.g. `ym ssh -p 2222 devbox`); `~/.ssh/config` applies as usual.
- Each `ym ssh` that connects is saved with its options to `~/.ym/ssh-hosts.json`. Plain `ym ssh` then lists the saved hosts, most recent first: type to filter, `Enter` connects, `Ctrl-x` forgets the selected one, `Esc` cancels.
- Uploads older than 7 days are deleted on the next upload. Failed uploads leave the local path as is and are logged to `~/.ym/ssh.log`.

## Dashboard Basics

- Type a prompt and press `Enter` to start a new session with the default agent (Cursor unless changed in `Ctrl-s` settings).
- `Shift-Enter` adds a line break for a multi-line prompt. It needs tmux 3.5+ and a terminal that reports modified keys (iTerm2, Ghostty, kitty, WezTerm). `Ctrl-j` works in any terminal, and so does `Option-Enter` when Option acts as Meta.
- Use `@folder` tags in the prompt to target workspace folders.
- The input starts with the agent it will use (e.g. `Cursor › `). `Shift-Tab` switches it for that prompt; after launch it goes back to the default.
- `Ctrl-g` returns focus to the dashboard list from an agent pane/window.
- `Tab` switches between Sessions and Archived.
- `Ctrl-t` cycles grouping mode.
- `Ctrl-n` fills the prompt with the selected session's prompt, folders, and agent, so `Enter` starts another session like it (edit it first if you like).
- `Ctrl-p` pins the selected session to a Pinned group at the top of the list (press again to unpin).
- `Ctrl-s` opens settings. Its Cursor section has "Auto-run commands", which launches Cursor with `--force` so it runs commands without asking.
- The footer lists the essential keys; `Ctrl-/` expands it to every shortcut (press again or `Esc` to collapse).

> Note: keybindings and UI details evolve quickly; run `ym help` and check source under `src/ui` for the latest behavior.

## Development

```bash
bun install
bun run dev
```

Other scripts:

```bash
bun run build
bun run typecheck
bun test
```

## Project Layout

- `src/cli.tsx` - CLI entrypoint
- `src/core/*` - tmux integration, hooks, session state, storage, install logic
- `src/core/cursor.ts`, `src/core/codex.ts` - per-agent launch commands; `src/core/agents.ts` - the agent list
- `src/ui/*` - Ink TUI components and dashboard runtime
- `test/*` - unit and integration tests
- `scripts/setup.sh` - local install helper

## Name

`ym` currently expands to **YesMaster**. Prefer "Yes, Main!"? Turn on "Call me Main instead of Master" in settings (`Ctrl-s`).
