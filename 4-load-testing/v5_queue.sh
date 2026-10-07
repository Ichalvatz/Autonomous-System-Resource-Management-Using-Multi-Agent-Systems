#!/bin/bash
# Prompt v5 test (CPU cost per request in the prompt), queued 2026-10-01 evening after the
# blind cpuhog test of v4. Waits for cpuhog_queue.sh to finish, then:
#   cpuhog x2 (does v5 fix it?), stuck x1 and baseline x1 (does v5 still restart / still scale right?).
# Stop it any time:  pkill -f v5_queue.sh; pkill -TERM -f run_experiment.sh
cd "$(dirname "$0")/.."
until grep -q "cpuhog queue: all done" 4-load-testing/queue.log; do sleep 30; done
sleep 60
export AIOPS_PROMPT=v5 LABEL=llm-v5
for scenario in cpuhog cpuhog stuck baseline; do
  echo "[$(date +%H:%M:%S)] v5 queue: starting $scenario" >> 4-load-testing/queue.log
  SCENARIO=$scenario ./4-load-testing/run_experiment.sh llm "prompt v5 (CPU per request), tested after the v4 cpuhog failure"
  echo "[$(date +%H:%M:%S)] v5 queue: finished $scenario (exit $?)" >> 4-load-testing/queue.log
  sleep 120
done
.venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
echo "[$(date +%H:%M:%S)] v5 queue: all done (comparison.md regenerated)" >> 4-load-testing/queue.log
