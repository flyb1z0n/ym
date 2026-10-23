# ym — multi-agent support (Cursor + Codex)

Status: implemented. Date: 2026-10-13, updated 2026-10-19 with what
implementation against Codex CLI 0.159.3 changed.

## Goal

Run Codex CLI sessions from the dashboard alongside Cursor ones. Cursor stays the
default; Shift-Tab in the prompt input switches a single session to Codex.

## Decisions

| Topic | Decision |
|---|---|
| Agents | Cursor (`agent`) and Codex (`codex`). No generic/custom command, no Claude Code yet |
| Selection | Shift-Tab cycles the agent shown at the start of the input; resets to the default after each launch. Grouping moves to Ctrl-T |
| Default | `defaultAgent` in `settings.json`, cycled in Ctrl-s; defaults to `cursor` |
| Status source | Each agent's own hooks, normalized to ym's existing event names |
| Codex hook trust | User trusts ym's hooks once in Codex; ym warns when a Codex session reports nothing |
| Codex folder trust | `ym install` trusts `~/.ym/worktrees` once in `~/.codex/config.toml` |
| Import | Past Codex sessions appear in the import picker next to Cursor chats |

## Architecture

### Agents

`Session` gains `agent: "cursor" | "codex"`. Sessions without the field load as
`cursor`, so existing state needs no migration.

The two start flows differ too much for a shared driver interface to pay off, so
each agent keeps a small module and callers branch on `agentOf(session)`:

- `src/core/agents.ts`: the agent list, display names, `agentAvailable()`.
- `src/core/cursor.ts`: unchanged.
- `src/core/codex.ts`: launch/resume argv, rollout scanning (`YM_CODEX_BIN`,
  `YM_CODEX_MODEL`, `YM_CODEX_HOME`).

`Session` also gains `launchedAt`: Codex sessions run before their chat id is
known, so "starting" becomes "no chat id and never launched".

### Choosing the agent

The input starts with the agent the prompt will go to, coloured per agent:
`Cursor › fix the login bug`. Shift-Tab cycles it (it previously cycled the
grouping mode, which moves to Ctrl-T). It starts on the default agent and goes
back to it after each launch, and when the default changes in settings.

An earlier draft used `#codex` / `#cursor` tags in the prompt text; it was
dropped for a single, always-visible control.

### UI

- Ctrl-s gets a "Default agent" row that cycles Cursor ↔ Codex.
- Session rows show a short dim agent label only when it differs from the
  default, so Cursor-only setups look unchanged.

## Codex lifecycle

### Start

Codex has no `create-chat`, so the chat id isn't known before launch.

1. Save the session with an empty `chatId` (the existing "starting" state), and
   name the worktree if enabled.
2. Set `launchedAt` and open a pane:
   `codex -C <dir> [-m <model>] [--add-dir …] [--image=…] -- "<prompt>"` with
   `YM_SESSION_ID` in the environment. `--` keeps prompts starting with `-` or
   named like a subcommand (`review`) as prompts.
3. The dashboard shows the pane right away, so Codex's own first-run screens
   (hook review, folder trust) are visible and answerable.
4. The `SessionStart` hook writes the payload's `session_id` into `chatId`; any
   later hook does too while it's still empty (hooks trusted mid-session).
5. If a Codex session is resumed without a `chatId` (hooks never ran), scan
   `~/.codex/sessions/**/rollout-*.jsonl` for an interactive session with the
   same `cwd` created since launch.

### Resume

`codex resume <chatId> -C <dir> [--add-dir …]`.

### Folder trust

Codex asks to trust every new folder, which would stop each fresh worktree. A
per-run `-c projects=…` override avoids that but makes Codex skip its shared
background server (verified on 0.159.3), so instead `ym install` appends one
entry to `~/.codex/config.toml`:

```toml
[projects."/Users/me/.ym/worktrees"]
trust_level = "trusted"
```

Codex applies it to subfolders. It's skipped when the user already has an entry
for that folder, and `ym uninstall` removes only that block. Sessions outside
ym worktrees get Codex's normal trust prompt, once per folder.

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

Hook processes inherit the pane environment, so `YM_SESSION_ID` arrives as with
Cursor. Codex hooks print nothing (Codex reads empty output as "continue").
The hook maps Codex events onto ym's existing names:

| Codex event | Recorded as |
|---|---|
| `SessionStart` | `sessionStart`: sets `chatId`, no status change |
| `UserPromptSubmit` | `beforeSubmitPrompt` (working) |
| `PreToolUse`, `PostToolUse` | `preToolUse` / `postToolUse` (working) |
| `PermissionRequest` | `permissionRequest` (your turn; new in `status.ts`) |
| `Stop` | `stop` completed |
| `SessionEnd` (3 s timeout cap) | `sessionEnd` |

Subagent hooks carry the parent `session_id`, and `SessionEnd` doesn't fire for
subagents, so the Cursor subagent guard isn't needed for Codex.

Codex only runs user hooks after the user trusts them (by hash, recorded under
`[hooks.state]` in `config.toml`), via its startup "Hooks need review" screen or
`/hooks`. ym doesn't bypass this; while a live Codex session has reported no id
for 20 s, the dashboard says to trust ym's hooks.

### Import

Rollout files are the source of truth: `session_id`, `cwd`, `timestamp` and
`originator` come from the first 16 KB of each (the `session_meta` line can be
too long to read whole), `codex exec` runs are skipped, and titles come from
`~/.codex/session_index.jsonl` (`thread_name`). The picker merges them with
Cursor chats, labelled by agent.

## Error handling

- Codex selected without `codex` on PATH: "Codex CLI `codex` not found on PATH";
  the prompt stays in the input, like an unknown `@folder`.
- No id from a live Codex session after 20 s: hint to trust ym's hooks.
- Resuming a Codex session with no id and no matching rollout: an error asking
  to start a new one.
- Hook script keeps failing open: always exits 0.
- Install/uninstall back up each file they change to `.ym-bak`.

## Testing

- Codex launch and resume argv.
- Codex event → status, including `permissionRequest`.
- Codex hooks and folder-trust install/uninstall against a temp home.
- Codex session scan and `findCodexSession` from fixture rollout files.
- Settings: `defaultAgent` falls back to `cursor`.
- tmux integration with `stub-codex.sh`: worktree launch, id from hooks, exit,
  resume by id, remove; and resume via rollout scan when hooks are untrusted.
- Manual run against Codex CLI 0.159.3: hook review screen, events, resume.

## Out of scope

Claude Code, generic agent commands, per-agent model settings in the UI,
switching an existing session to another agent.
