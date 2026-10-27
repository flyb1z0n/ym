#!/bin/sh
# Stands in for ssh: records its arguments and runs the remote command (the last argument) locally.
printf '%s\n' "$*" >> "$YM_STUB_SSH_LOG"
for last; do :; done
exec sh -c "$last"
