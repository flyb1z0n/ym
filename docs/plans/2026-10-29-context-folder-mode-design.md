# Context mode for @folder tags

## Problem

`@folder` tags pick the session's workspace: the first becomes the cwd, the rest `--add-dir` roots. Sometimes the right workspace is the folder holding every repo, and the tags should only tell the agent where to look first.

## Design

- `Ctrl-f` toggles context mode for the prompt being typed; like the agent, it resets after each launch. The input shows `context ›` and the target line reads `in ~/dev · context: api, web`.
- The first `Ctrl-f` with no dev directory saved opens a dialog asking for "the folder that contains all your repositories", pre-filled with the first `YM_ROOTS` entry (`~/dev`). It is saved as `devDir` in settings and editable from a "Dev directory" row in `Ctrl-s`.
- A context session starts in the dev directory, never in a worktree. Its prompt gets a block listing the tagged folders:

  ```
  Context: start by looking at these folders; they're most relevant to this task:
  - /Users/me/dev/api
  ```

  Tagged folders outside the dev directory are also passed as `--add-dir` so the agent can open them.
- The session saves the typed prompt and `contextFolders`, so `Ctrl-n` refills the same tags with context mode on.

## Testing

Unit tests cover the prompt block, the `devDir` setting, and `repeatInput`; the tmux integration test checks the cwd, `--add-dir`, the prompt block, and that no worktree is used.
