#!/usr/bin/env bash
# Forward a Cursor (or other command-type) hook payload to AgentVisualCrazy's
# local hook-receiver. Reads JSON from stdin, POSTs it, exits 0 with `{}` so
# Cursor's fail-open hook clients proceed even if the observer is down.
#
# Install: see scripts/hooks/cursor-hooks.example.json
# Env:
#   SHADOW_HOOK_URL   default http://127.0.0.1:9477/hook
#   SHADOW_HOOK_TOKEN optional shared token (sent as X-Shadow-Token)
#   SHADOW_HOOK_SOURCE optional EventSource override (default cursor-hook)

set -u

URL="${SHADOW_HOOK_URL:-http://127.0.0.1:9477/hook}"
TOKEN="${SHADOW_HOOK_TOKEN:-}"
SOURCE="${SHADOW_HOOK_SOURCE:-cursor-hook}"

BODY="$(cat || true)"
if [ -z "${BODY}" ]; then
  printf '%s\n' '{}'
  exit 0
fi

CURL_ARGS=(
  -sS
  -o /dev/null
  -w ''
  -X POST
  -H 'Content-Type: application/json'
  -H "X-Shadow-Source: ${SOURCE}"
  --connect-timeout 1
  --max-time 2
  --data-binary @-
)

if [ -n "${TOKEN}" ]; then
  CURL_ARGS+=(-H "X-Shadow-Token: ${TOKEN}")
fi

# Never block the observed agent if the observer is offline.
# Pipe the body so large hook payloads aren't truncated by argv limits.
printf '%s' "${BODY}" | curl "${CURL_ARGS[@]}" "${URL}" >/dev/null 2>&1 || true

printf '%s\n' '{}'
exit 0
