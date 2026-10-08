#!/usr/bin/env bash
# Builds ym, links it onto PATH, and registers its Cursor hooks.
# Override the link location with YM_BIN_DIR (default ~/.local/bin).
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="${YM_BIN_DIR:-$HOME/.local/bin}"

fail() { echo "setup: $*" >&2; exit 1; }

command -v bun >/dev/null || fail "bun is not installed (https://bun.sh)."
command -v tmux >/dev/null || fail "tmux is not installed (brew install tmux)."
command -v agent >/dev/null || fail "Cursor CLI 'agent' is not on PATH (https://cursor.com/cli)."
[[ "$repo" =~ [[:space:]] ]] && fail "repo path contains spaces, which Cursor hooks can't run: $repo"

echo "==> Installing dependencies"
(cd "$repo" && bun install --frozen-lockfile)

echo "==> Building dist/ym"
(cd "$repo" && bun run build)

echo "==> Linking $bin_dir/ym"
mkdir -p "$bin_dir"
ln -sf "$repo/dist/ym" "$bin_dir/ym"

echo "==> Registering Cursor hooks"
"$bin_dir/ym" install

case ":$PATH:" in
  *":$bin_dir:"*) echo "==> Done. Run: ym" ;;
  *) echo "==> Done. $bin_dir is not on your PATH; add it (e.g. in ~/.zshrc), then run: ym" ;;
esac
