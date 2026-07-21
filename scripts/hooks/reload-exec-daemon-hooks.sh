#!/usr/bin/env bash
# Reload Cursor exec-daemon hook config so a newly-written
# `.cursor/hooks.json` is picked up mid-session.
#
# Why this exists: the daemon loads hooks at startup. If you add project hooks
# after the VM/daemon is already running, Shell/tool hooks will NOT fire until
# ControlService.ReloadAgentSkills runs (that path also reloads hooks).
#
# Usage (inside a Cursor cloud/background agent VM):
#   scripts/hooks/reload-exec-daemon-hooks.sh
#
# Optional env:
#   EXEC_DAEMON_PORT   default 26053
#   EXEC_DAEMON_TOKEN  if unset, scraped from the running exec-daemon cmdline

set -euo pipefail

PORT="${EXEC_DAEMON_PORT:-26053}"
TOKEN="${EXEC_DAEMON_TOKEN:-}"

if [ -z "${TOKEN}" ]; then
  # Best-effort: parse --auth-token from the live exec-daemon process.
  CMDLINE="$(tr '\0' ' ' </proc/$(pgrep -f '/exec-daemon/index.js serve' | head -n1)/cmdline 2>/dev/null || true)"
  TOKEN="$(printf '%s' "${CMDLINE}" | sed -n 's/.*--auth-token \([^ ]*\).*/\1/p')"
fi

if [ -z "${TOKEN}" ]; then
  echo "reload-exec-daemon-hooks: could not find EXEC_DAEMON_TOKEN" >&2
  exit 1
fi

printf '%s' '{}' > /tmp/shadow-reload-hooks-req.json
HTTP_CODE="$(curl -sS -o /tmp/shadow-reload-hooks-resp.json -w '%{http_code}' \
  -X POST "http://127.0.0.1:${PORT}/agent.v1.ControlService/ReloadAgentSkills" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Connect-Protocol-Version: 1" \
  --data-binary @/tmp/shadow-reload-hooks-req.json)"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "reload-exec-daemon-hooks: HTTP ${HTTP_CODE}" >&2
  cat /tmp/shadow-reload-hooks-resp.json >&2 || true
  exit 1
fi

echo "reload-exec-daemon-hooks: ok (hooks config reloaded)"
