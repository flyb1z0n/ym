# ym (YesMaster)

`ym` is a terminal dashboard for running and monitoring multiple background Cursor CLI (`agent`) sessions.

It uses a dedicated tmux server (`tmux -L ym`) to keep one dashboard pane plus one pane/window per session, with live status and quick switching.

## Features

- Start and monitor many Cursor agent sessions from one TUI.
- See session states (`working`, `ready`, `stopped`, `imported`, etc.) in real time via Cursor hooks.
- Jump into a running session pane instantly, then return to the dashboard.
- Launch prompts from the dashboard with `@folder` tags.
- Import past Cursor chats and resume them.
- Optional Cursor-managed worktrees for new sessions.

## Requirements

- [Bun](https://bun.sh)
- [tmux](https://github.com/tmux/tmux/wiki)
- [Cursor CLI `agent`](https://cursor.com/cli) on your `PATH`
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
- runs `ym install` to register Cursor hooks in `~/.cursor/hooks.json`

If `~/.local/bin` is not on your `PATH`, add it in your shell profile.

## Usage

```bash
ym
```

CLI commands:

- `ym` - open dashboard (starts/attaches to the `ym` tmux server)
- `ym install` - register hooks
- `ym uninstall` - remove hooks
- `ym help` - show help

## Dashboard Basics

- Type a prompt and press `Enter` to start a new Cursor session.
- Use `@folder` tags in the prompt to target workspace folders.
- `Ctrl-g` returns focus to the dashboard list from an agent pane/window.
- `Tab` switches between Sessions and Archived.
- `Shift-Tab` cycles grouping mode.
- `Ctrl-s` opens settings.

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
- `src/ui/*` - Ink TUI components and dashboard runtime
- `test/*` - unit and integration tests
- `scripts/setup.sh` - local install helper

## Name

`ym` currently expands to **YesMaster**.
