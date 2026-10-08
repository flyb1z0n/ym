#!/bin/bash
# Stands in for Cursor's `agent`: emits the same hook events through `ym hook`.
set -u
hook() { printf '%s' "${2:-}" | $YM_TEST_SELF hook "$1" >/dev/null; }

if [[ "${1:-}" == "create-chat" ]]; then
  echo "11111111-2222-3333-4444-555555555555"
  exit 0
fi

# Worktree naming call: answer like a model would, untidy on purpose.
if [[ "${1:-}" == "-p" ]]; then
  echo "Do The Thing!"
  exit 0
fi

prompt="${!#}"
echo "stub agent: $*"
if [[ "$prompt" != "--trust" ]]; then
  hook beforeSubmitPrompt
  hook preToolUse '{"tool_name":"Shell"}'
  sleep 0.5
  hook postToolUse '{"tool_name":"Shell"}'
  hook stop '{"status":"completed"}'
fi
echo "→ Add a follow-up"
while IFS= read -r line; do
  if [[ "$line" == "exit" ]]; then
    hook sessionEnd
    exit 0
  fi
  echo "got: $line"
  hook beforeSubmitPrompt
  sleep 0.5
  hook stop '{"status":"completed"}'
done
