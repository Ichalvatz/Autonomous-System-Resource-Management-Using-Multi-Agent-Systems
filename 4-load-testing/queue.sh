#!/bin/bash
# Run experiments back to back: ./4-load-testing/queue.sh hpa rules llm ...
cd "$(dirname "$0")/.."
for s in "$@"; do
  echo "[$(date +%H:%M:%S)] queue: starting $s" >> 4-load-testing/queue.log
  notes=""; [ "$s" = "llm" ] && notes="${QUEUE_NOTES:-}"
  ./4-load-testing/run_experiment.sh "$s" "$notes"
  echo "[$(date +%H:%M:%S)] queue: finished $s (exit $?)" >> 4-load-testing/queue.log
  sleep 180   # host idle between runs
done
echo "[$(date +%H:%M:%S)] queue: all done" >> 4-load-testing/queue.log
