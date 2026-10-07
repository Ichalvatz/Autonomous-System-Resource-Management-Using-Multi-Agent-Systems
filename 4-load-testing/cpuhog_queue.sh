#!/bin/bash
# Blind generalization test (2026-10-01 evening): the CPU-hog fault with prompt v4 unchanged.
cd "$(dirname "$0")/.."
for s in llm rules llm hpa; do
  echo "[$(date +%H:%M:%S)] cpuhog queue: starting $s" >> 4-load-testing/queue.log
  SCENARIO=cpuhog ./4-load-testing/run_experiment.sh "$s" "cpuhog blind test, prompt v4 unchanged"
  echo "[$(date +%H:%M:%S)] cpuhog queue: finished $s (exit $?)" >> 4-load-testing/queue.log
  sleep 60
done
echo "[$(date +%H:%M:%S)] cpuhog queue: all done" >> 4-load-testing/queue.log
