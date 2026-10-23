#!/bin/bash
# Stands in for Codex CLI: saves a rollout like Codex and emits its hook events through
# `ym hook <Event> codex`, unless $YM_HOME/codex-hooks-off exists (hooks not trusted).
set -u
id="01a00000-0000-7000-8000-0000000000${YM_SESSION_ID:0:2}"
hook() {
  [[ -e "$YM_HOME/codex-hooks-off" ]] && return
  printf '{"session_id":"%s"%s}' "$id" "${2:-}" | $YM_TEST_SELF hook "$1" codex >/dev/null
}

prompt=""
args=("$@")
for i in "${!args[@]}"; do
  if [[ "${args[$i]}" == "--" ]]; then prompt="${args[$((i + 1))]}"; fi
done

now=$("${YM_TEST_SELF%% *}" -e 'console.log(new Date().toISOString())')
mkdir -p "$YM_CODEX_HOME/sessions"
printf '{"type":"session_meta","payload":{"session_id":"%s","id":"%s","timestamp":"%s","cwd":"%s","originator":"codex-tui"}}\n' \
  "$id" "$id" "$now" "$(pwd -P)" >"$YM_CODEX_HOME/sessions/rollout-test-$id.jsonl"

echo "stub codex: $*"
echo "cwd: $(pwd -P)"
started=""
turn() {
  [[ -z "$started" ]] && hook SessionStart ',"source":"startup"' && started=1
  hook UserPromptSubmit
  hook PreToolUse ',"tool_name":"Bash"'
  sleep 0.5
  hook PostToolUse ',"tool_name":"Bash"'
  hook Stop
}
[[ -n "$prompt" ]] && turn
echo "› Ask Codex to do anything"
while IFS= read -r line; do
  if [[ "$line" == "exit" ]]; then
    hook SessionEnd
    exit 0
  fi
  echo "got: $line"
  turn
done
