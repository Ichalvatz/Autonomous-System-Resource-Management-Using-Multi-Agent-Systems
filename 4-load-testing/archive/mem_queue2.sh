#!/bin/bash
# Memory experiment, independent repetitions (2026-10-02 00:00): prompt v4 + memory ON, cpuhog, 3 runs.
# Before EVERY run the memory is restored to the 23:00 snapshot (44 entries, incl. the two v5 restarts), so no run
# sees another run's outcome, and the Gemini API must be reachable (run 3 of the first series lost DNS).
cd "$(dirname "$0")/.."
SNAP=3-ai-agent/chroma_snapshot_2026-10-01_2300_before_memory_test.json
export AIOPS_PROMPT=v4 AIOPS_MEMORY=on LABEL=llm-v4-mem-indep
for i in 1 2 3; do
  until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
    echo "[$(date +%H:%M:%S)] mem2 queue: Gemini API unreachable, waiting" >> 4-load-testing/queue.log; sleep 30
  done
  .venv/bin/python3 3-ai-agent/memory_snapshot.py restore $SNAP >> 4-load-testing/queue.log 2>&1 || exit 1
  echo "[$(date +%H:%M:%S)] mem2 queue: starting run $i (memory restored)" >> 4-load-testing/queue.log
  SCENARIO=cpuhog ./4-load-testing/run_experiment.sh llm "memory test, independent: v4, memory reset to 23:00 snapshot before the run"
  echo "[$(date +%H:%M:%S)] mem2 queue: finished run $i (exit $?)" >> 4-load-testing/queue.log
  [ $i -lt 3 ] && sleep 60
done
.venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
echo "[$(date +%H:%M:%S)] mem2 queue: all done (comparison.md regenerated)" >> 4-load-testing/queue.log
