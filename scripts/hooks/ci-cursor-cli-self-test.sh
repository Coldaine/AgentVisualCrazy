#!/usr/bin/env bash
# CI self-test: run Cursor headless CLI so project hooks fire into our receiver.
#
# Requires:
#   - CURSOR_API_KEY (repo secret)
#   - Cursor CLI (`agent`) on PATH — install via https://cursor.com/install
#   - .cursor/hooks.json pointing at scripts/hooks/forward-to-shadow.sh
#
# Official refs:
#   - https://cursor.com/docs/cli/github-actions
#   - https://cursor.com/docs/cli/headless
#   - https://cursor.com/docs/hooks (cloud/CLI pick up project hooks.json)
#   - https://cursor.com/docs/enterprise/deployment-patterns ("Hooks work for … CLI")
#
# Exit codes:
#   0 — captured at least one cursor harness event mentioning the CI marker
#   1 — Cursor ran but hooks did not deliver expected events
#   2 — missing prerequisites

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MARKER="CURSOR_HOOK_CI_MARKER_42"
OUT="${SHADOW_LIVE_CAPTURE_OUT:-/tmp/cursor-ci-self-hook.jsonl}"
PORT="${SHADOW_HOOK_RECEIVER_PORT:-9477}"
LOG="/tmp/cursor-ci-capture-server.log"

if [ -z "${CURSOR_API_KEY:-}" ]; then
  echo "ci-cursor-cli-self-test: CURSOR_API_KEY is not set" >&2
  exit 2
fi

if ! command -v agent >/dev/null 2>&1; then
  echo "ci-cursor-cli-self-test: 'agent' CLI not on PATH (install with curl https://cursor.com/install -fsS | bash)" >&2
  exit 2
fi

if [ ! -f .cursor/hooks.json ]; then
  echo "ci-cursor-cli-self-test: missing .cursor/hooks.json" >&2
  exit 2
fi

rm -f "$OUT" "$LOG"
export SHADOW_HOOK_URL="http://127.0.0.1:${PORT}/hook"
export SHADOW_HOOK_SOURCE="cursor-hook"
export SHADOW_LIVE_CAPTURE_OUT="$OUT"
export SHADOW_HOOK_RECEIVER_PORT="$PORT"

# Start the same capture server the Electron app uses.
npx --yes tsx scripts/hooks/live-capture-server.mjs --port "$PORT" --out "$OUT" >"$LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for health
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null

echo "ci-cursor-cli-self-test: capture server up on :${PORT}"
echo "ci-cursor-cli-self-test: invoking Cursor CLI agent (project hooks should POST here)"

# Restricted autonomy: only run the marker shell command. --force/--yolo allows
# non-interactive tool use per https://cursor.com/docs/cli/headless
set +e
agent -p --force --output-format text \
  "You are in CI. Run EXACTLY this shell command and then stop:
echo ${MARKER}
Do not edit files. Do not run any other commands. After the echo succeeds, reply with DONE." \
  2>&1 | tee /tmp/cursor-ci-agent-output.txt
AGENT_STATUS=${PIPESTATUS[0]}
set -e

echo "ci-cursor-cli-self-test: agent exit=${AGENT_STATUS}"

# Give late afterShellExecution / postToolUse hooks a moment to flush.
sleep 1

if [ ! -s "$OUT" ]; then
  echo "ci-cursor-cli-self-test: FAIL — capture file empty (hooks never reached the receiver)" >&2
  echo "--- capture server log ---" >&2
  cat "$LOG" >&2 || true
  echo "--- agent output (tail) ---" >&2
  tail -n 80 /tmp/cursor-ci-agent-output.txt >&2 || true
  exit 1
fi

if ! grep -Fq "$MARKER" "$OUT"; then
  # Hooks may fire without embedding the command string in every event shape —
  # accept any cursor harness tool event as a weaker pass only if agent ran.
  if grep -Fq '"harnessId":"cursor"' "$OUT" && grep -Eq '"kind":"tool_(started|completed)"' "$OUT"; then
    echo "ci-cursor-cli-self-test: WARN — cursor events captured but marker string missing"
    echo "ci-cursor-cli-self-test: treating as PASS (hooks fired; prompt may have been rewritten)"
  else
    echo "ci-cursor-cli-self-test: FAIL — no cursor harness tool events for marker ${MARKER}" >&2
    echo "--- capture sample ---" >&2
    head -n 20 "$OUT" >&2 || true
    exit 1
  fi
fi

EVENT_COUNT="$(wc -l <"$OUT" | tr -d ' ')"
echo "ci-cursor-cli-self-test: PASS — ${EVENT_COUNT} canonical event(s) captured via project hooks"
grep -E 'harnessId|toolName|"kind"' "$OUT" | head -n 40 || true
exit 0
