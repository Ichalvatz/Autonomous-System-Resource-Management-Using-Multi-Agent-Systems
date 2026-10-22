#!/bin/bash
# Memory experiment (2026-10-01 23:00): prompt v4 + memory ON on the cpuhog fault, 3 runs.
# Compare with the two v4 cpuhog runs of 18:29 / 19:08 (memory had nothing similar then).
cd "$(dirname "$0")/.."
export AIOPS_PROMPT=v4 AIOPS_MEMORY=on LABEL=llm-v4-mem
for i in 1 2 3; do
  echo "[$(date +%H:%M:%S)] mem queue: starting run $i" >> 4-load-testing/queue.log
  SCENARIO=cpuhog ./4-load-testing/run_experiment.sh llm "memory test: prompt v4, memory holds v5 restarts"
  echo "[$(date +%H:%M:%S)] mem queue: finished run $i (exit $?)" >> 4-load-testing/queue.log
  [ $i -lt 3 ] && sleep 60
done
.venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
echo "[$(date +%H:%M:%S)] mem queue: all done (comparison.md regenerated)" >> 4-load-testing/queue.log
