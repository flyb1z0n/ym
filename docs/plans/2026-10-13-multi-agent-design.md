# ym — multi-agent support (Cursor + Codex)

Status: approved design. Date: 2026-10-13.

## Goal

Run Codex CLI sessions from the dashboard alongside Cursor ones. Cursor stays the
default; a `#codex` tag in the prompt switches a single session to Codex.

## Decisions

| Topic | Decision |
|---|---|
| Agents | Cursor (`agent`) and Codex (`codex`). No generic/custom command, no Claude Code yet |
| Selection | `#agent` tag anywhere in the prompt, autocompleted like `@folder` |
| Default | `defaultAgent` in `settings.json`, cycled in Ctrl-s; defaults to `cursor` |
| Status source | Each agent's own hooks, normalized to ym's existing event names |
| Codex hook trust | User trusts ym's hooks once in Codex; ym warns when a Codex session reports nothing |
| Import | Past Codex sessions appear in the import picker next to Cursor chats |

## Architecture

### Agent drivers

`Session` gains `agent: "cursor" | "codex"`. Sessions without the field load as
`cursor`, so existing state needs no migration.

`src/core/agents/` holds one driver per agent behind a small interface:

- `bin()` / `available()`: binary lookup (`YM_AGENT_BIN`, `YM_CODEX_BIN`).
- `launchCommand(opts)` / `resumeCommand(session)`.
- `installHooks(self)` / `uninstallHooks()` / `hooksInstalled(self)`.
- `scanChats()`: past sessions for the import picker.

`cursor.ts` is today's `src/core/cursor.ts` moved behind the interface.
`actions.ts`, `install.ts` and the import picker dispatch on `session.agent`
instead of importing Cursor code directly.

### Prompt tag

`parsePrompt` also extracts `#<agent>` tokens (same `(^|\s)` boundary as `@`):

- A known agent tag is stripped from the prompt and returned as `agent`.
- An unknown `#word` stays in the prompt untouched (markdown headings, `#123`).
- Two different agent tags in one prompt is an error.

`LineInput` suggests agent names while a trailing `#` token is typed.

### UI

- Ctrl-s gets a "Default agent" row that cycles Cursor ↔ Codex.
- Session rows show a short dim agent label only when it differs from the
  default, so Cursor-only setups look unchanged.

## Codex lifecycle

### Start

Codex has no `create-chat`, so the chat id isn't known before launch.

1. Save the session with an empty `chatId` (the existing "starting" state).
2. New pane: `codex -C <cwd> [--add-dir …] [-m <model>] "<prompt>"` with
   `YM_SESSION_ID` in the environment. A leading `-` in the prompt is guarded
   the same way as for Cursor.
3. The `SessionStart` hook writes the payload's `session_id` into the session's
   `chatId`.
4. Fallback if no hook arrives before `START_TIMEOUT_MS`: scan
   `~/.codex/sessions/**/rollout-*.jsonl` for a `session_meta` with matching `cwd`
   and a timestamp after launch.

### Resume

`codex resume <chatId> -C <cwd> [--add-dir …]`.

### Worktrees

Codex's `--worktree` takes no name and its location isn't documented, so ym
creates the worktree itself:
`git worktree add -b <name> ~/.ym/worktrees/<repo>/<name>`, then launches with
`-C <path>`. Worktree naming keeps working, and `removeWorktree` already matches
by branch or folder name.

### Hooks

`ym install` merges entries into `~/.codex/hooks.json` (skipped when `~/.codex`
is absent), using Codex's nested shape:

```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "ym hook Stop codex", "timeout": 5 }] }] } }
```

The hook maps Codex events onto ym's existing names so `status.ts` is unchanged:

| Codex event | Recorded as |
|---|---|
| `SessionStart` | sets `chatId`; no status change |
| `UserPromptSubmit` | `beforeSubmitPrompt` (working) |
| `PreToolUse`, `PostToolUse` | `preToolUse` / `postToolUse` (working) |
| `SubagentStart`, `SubagentStop` | `subagentStart` / `subagentStop` (working) |
| `PermissionRequest` | `stop` completed (your turn) |
| `Stop` | `stop` completed |
| `SessionEnd` | `sessionEnd` |

Subagent hooks carry the parent `session_id`, and `SessionEnd` doesn't fire for
subagents, so the Cursor subagent guard isn't needed for Codex.

Codex only runs user hooks after the user trusts them (by hash, via `/hooks` or
the startup prompt). ym doesn't bypass this.

### Import

Read `~/.codex/session_index.jsonl` (`id`, `thread_name`, `updated_at`), take
`cwd` from the first line of each rollout file, and merge with Cursor chats in
the picker, labelled by agent.

## Error handling

- `#codex` without `codex` on PATH: "Codex CLI not found"; the prompt stays in
  the input, like an unknown `@folder`.
- No events from a live Codex session: show "Codex hooks not trusted — run
  /hooks in Codex"; status falls back to pane liveness.
- Hook script keeps failing open: always exits 0 with `{}`.
- Install/uninstall back up each hooks file to `.ym-bak` before writing.

## Testing

- `parsePrompt`: known/unknown/duplicate agent tags, mixed with `@folders`.
- Codex launch and resume argv.
- Codex event → ym event mapping, including `SessionStart` setting `chatId`.
- Codex hooks install merge/strip against a temp home.
- Codex session scan from fixture `session_index.jsonl` + rollout files.
- Settings: `defaultAgent` falls back to `cursor`; sessions without `agent` load
  as Cursor.

## Out of scope

Claude Code, generic agent commands, per-agent model settings in the UI,
switching an existing session to another agent.
