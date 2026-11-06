#!/bin/sh
# Installs the latest ym release and registers its agent hooks:
#   curl -fsSL https://raw.githubusercontent.com/flyb1z0n/ym/main/install.sh | sh
# Override the install location with YM_BIN_DIR (default ~/.local/bin).
set -eu

bin_dir="${YM_BIN_DIR:-$HOME/.local/bin}"
releases="${YM_UPDATE_URL:-https://github.com/flyb1z0n/ym/releases}"

fail() { echo "install: $*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "unsupported OS: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "unsupported CPU: $(uname -m)" ;;
esac
asset="ym-$os-$arch"

command -v curl >/dev/null || fail "curl is not installed."
if command -v sha256sum >/dev/null; then sha="sha256sum"; else sha="shasum -a 256"; fi

version="$(curl -fsSL "$releases/latest/download/version")" || fail "couldn't find the latest release."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> Downloading ym $version ($asset)"
curl -fsSL "$releases/download/v$version/$asset" -o "$tmp/$asset"
curl -fsSL "$releases/download/v$version/checksums.txt" -o "$tmp/checksums.txt"
expected="$(awk -v a="$asset" '$2 == a || $2 == "*" a { print $1 }' "$tmp/checksums.txt")"
actual="$($sha "$tmp/$asset" | awk '{ print $1 }')"
[ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "checksum mismatch for $asset."

echo "==> Installing $bin_dir/ym"
mkdir -p "$bin_dir"
chmod 755 "$tmp/$asset"
# mv from another filesystem copies; writing over a running ym in place gets it killed on macOS.
rm -f "$bin_dir/ym"
mv "$tmp/$asset" "$bin_dir/ym"

command -v tmux >/dev/null || echo "install: tmux is not installed; ym needs it (brew install tmux)." >&2

echo "==> Registering agent hooks"
"$bin_dir/ym" install

case ":$PATH:" in
  *":$bin_dir:"*) echo "==> Done. Run: ym" ;;
  *) echo "==> Done. $bin_dir is not on your PATH; add it (e.g. in ~/.zshrc), then run: ym" ;;
esac
