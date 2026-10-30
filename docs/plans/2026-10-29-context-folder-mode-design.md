# Context mode for @folder tags

## Problem

`@folder` tags used to pick the session's workspace: the first became the cwd, the rest `--add-dir` roots, and an untagged prompt started in whatever folder `ym` was launched from. Usually the right workspace is the folder holding every repo, and the tags should only tell the agent where to look first.

## Design

Context mode is the only mode.

- `ym` needs a dev directory, "the folder that contains all your repositories". The first `ym` asks for it in the terminal before starting tmux, pre-filled with the first `YM_ROOTS` entry (`~/dev`), and saves it as `devDir` in settings. Later runs open the ym tmux server in it without asking; if the saved folder is gone, `ym` asks again. A "Dev directory" row in `Ctrl-s` changes it.
- Every session starts in the dev directory, never in a worktree. The target line reads `in ~/dev · context: api, web`. Its prompt gets a block listing the tagged folders:

  ```
  Context: start by looking at these folders; they're most relevant to this task:
  - /Users/me/dev/api
  ```

  Tagged folders outside the dev directory are also passed as `--add-dir` so the agent can open them.
- The session saves the typed prompt and `contextFolders`, so `Ctrl-n` refills the same tags. Older sessions without `contextFolders` refill their cwd and `--add-dir` roots as tags.
- `@` suggestions include the dev directory's subfolders.

## Testing

Unit tests cover the prompt block, the `devDir` setting, the startup prompt, and `repeatInput`; the tmux integration test checks the cwd, `--add-dir`, the prompt block, that no worktree is used, and that a session needs a dev directory.
