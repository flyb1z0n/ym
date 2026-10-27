#!/bin/sh
# Stands in for ssh: records its arguments, creates the control socket as a connected master would
# (unless YM_STUB_SSH_NO_MASTER is set), and runs the remote command (the last argument) locally.
printf '%s\n' "$*" >> "$YM_STUB_SSH_LOG"
for arg; do
  case "$arg" in ControlPath=*) [ -z "$YM_STUB_SSH_NO_MASTER" ] && : > "${arg#ControlPath=}" ;; esac
done
for last; do :; done
exec sh -c "$last"
