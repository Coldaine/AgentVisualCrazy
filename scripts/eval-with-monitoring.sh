#!/bin/bash
# Run sidecar evals with process and memory monitoring
# Usage: bash scripts/eval-with-monitoring.sh [eval args...]
# Example: bash scripts/eval-with-monitoring.sh --eval-id 1 --mode mcp
# Example: bash scripts/eval-with-monitoring.sh --all --mode mcp

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MONITOR_LOG="$PROJECT_DIR/evals/workspace/process-monitor-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$PROJECT_DIR/evals/workspace"

# Snapshot: list all opencode/sidecar processes with PID, RSS, command
snapshot_processes() {
  local label="$1"
  echo "" >> "$MONITOR_LOG"
  echo "=== $label ($(date '+%H:%M:%S')) ===" >> "$MONITOR_LOG"
  echo "--- OpenCode processes ---" >> "$MONITOR_LOG"
  ps aux | grep -i opencode | grep -v grep >> "$MONITOR_LOG" 2>/dev/null || echo "  (none)" >> "$MONITOR_LOG"
  echo "--- Sidecar processes ---" >> "$MONITOR_LOG"
  ps aux | grep -i "sidecar" | grep -v grep | grep -v "eval-with-monitoring" >> "$MONITOR_LOG" 2>/dev/null || echo "  (none)" >> "$MONITOR_LOG"
  echo "--- Node processes (sidecar-related) ---" >> "$MONITOR_LOG"
  ps aux | grep "node.*sidecar\|node.*opencode" | grep -v grep | grep -v "eval-with-monitoring" >> "$MONITOR_LOG" 2>/dev/null || echo "  (none)" >> "$MONITOR_LOG"

  # Count and summarize
  local oc_count=$(ps aux | grep -i opencode | grep -v grep | wc -l | tr -d ' ')
  local sc_count=$(ps aux | grep -i "sidecar" | grep -v grep | grep -v "eval-with-monitoring" | wc -l | tr -d ' ')
  local total_rss=$(ps aux | grep -E "opencode|sidecar" | grep -v grep | grep -v "eval-with-monitoring" | awk '{sum+=$6} END {print sum/1024}' 2>/dev/null || echo "0")

  echo "SUMMARY: opencode=$oc_count sidecar=$sc_count total_rss_mb=${total_rss}" >> "$MONITOR_LOG"
  echo "[$label] opencode=$oc_count sidecar=$sc_count total_rss=${total_rss}MB"
}

# Background monitor: snapshot every 10 seconds
background_monitor() {
  local count=0
  while true; do
    count=$((count + 1))
    snapshot_processes "DURING (sample $count)" > /dev/null 2>&1
    sleep 10
  done
}

echo "=========================================="
echo "Sidecar Eval with Process Monitoring"
echo "=========================================="
echo "Monitor log: $MONITOR_LOG"
echo ""

# Pre-eval snapshot
echo "--- PRE-EVAL SNAPSHOT ---"
snapshot_processes "PRE-EVAL"
echo ""

# Start background monitor
background_monitor &
MONITOR_PID=$!
trap "kill $MONITOR_PID 2>/dev/null; wait $MONITOR_PID 2>/dev/null" EXIT

# Run the eval
echo "--- RUNNING EVAL ---"
echo "Args: $@"
echo ""
set +e
node "$PROJECT_DIR/evals/run_eval.js" "$@" 2>&1
EVAL_EXIT=$?
set -e

# Stop background monitor
kill $MONITOR_PID 2>/dev/null
wait $MONITOR_PID 2>/dev/null || true
trap - EXIT

# Wait a moment for cleanup
sleep 3

# Post-eval snapshot
echo ""
echo "--- POST-EVAL SNAPSHOT ---"
snapshot_processes "POST-EVAL"
echo ""

# Compare pre and post
echo "--- PROCESS DELTA ---"
PRE_OC=$(grep "SUMMARY.*PRE-EVAL" "$MONITOR_LOG" | head -1 | grep -o "opencode=[0-9]*" | cut -d= -f2)
POST_OC=$(grep "SUMMARY.*POST-EVAL" "$MONITOR_LOG" | tail -1 | grep -o "opencode=[0-9]*" | cut -d= -f2)
PRE_RSS=$(grep "SUMMARY.*PRE-EVAL" "$MONITOR_LOG" | head -1 | grep -o "total_rss_mb=[0-9.]*" | cut -d= -f2)
POST_RSS=$(grep "SUMMARY.*POST-EVAL" "$MONITOR_LOG" | tail -1 | grep -o "total_rss_mb=[0-9.]*" | cut -d= -f2)

echo "OpenCode processes: before=$PRE_OC after=$POST_OC delta=$((POST_OC - PRE_OC))"
echo "Total RSS (MB): before=$PRE_RSS after=$POST_RSS"

if [ "$POST_OC" -gt "$PRE_OC" ]; then
  echo ""
  echo "WARNING: Process leak detected! $((POST_OC - PRE_OC)) orphaned OpenCode processes."
  echo "Leaked processes:"
  grep "POST-EVAL" -A 100 "$MONITOR_LOG" | grep opencode | grep -v grep | grep -v SUMMARY
else
  echo ""
  echo "OK: No process leak detected."
fi

echo ""
echo "Full monitor log: $MONITOR_LOG"
echo "Peak samples during eval:"
grep "SUMMARY.*DURING" "$MONITOR_LOG" | sort -t= -k4 -n -r | head -3

exit $EVAL_EXIT
