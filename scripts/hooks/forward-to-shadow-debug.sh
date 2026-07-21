#!/usr/bin/env bash
# Thin wrapper used by dogfood / live experiments. Sets a debug invocation log
# so we can prove whether Cursor actually spawned the forwarder.
set -u
export SHADOW_HOOK_URL="${SHADOW_HOOK_URL:-http://127.0.0.1:9477/hook}"
export SHADOW_HOOK_DEBUG_LOG="${SHADOW_HOOK_DEBUG_LOG:-/tmp/cursor-live/hook-invocations.log}"
mkdir -p "$(dirname "${SHADOW_HOOK_DEBUG_LOG}")" 2>/dev/null || true
exec "$(dirname "$0")/forward-to-shadow.sh"
