#!/bin/bash
# Follow-up to v6_queue.sh (2026-10-03 15:20). Starts when v6_queue.sh has finished.
# 1. One more v6 badconfig run with a clean rollout history: in the first v6 badconfig run (15:09)
#    the history still showed revisions from the fault calibration that toggled the same flag
#    (a possible hint). The harness resets the history before every run since 15:30.
# 2. Prompts v5 and v4 on the same blind fault, memory off: is a prompt with a code-computed hint
#    (v5: "CPU per request >> 1x -> logs -> restart") or without investigation tools (v4) able
#    to handle a fault that only a rollback fixes? Neither has a rollback tool.
# The whole body is one { ... } block (safe against edits while it runs).
{
cd "$(dirname "$0")/.."
LOG=4-load-testing/queue.log
while pgrep -f "v6_queue.sh" >/dev/null; do sleep 60; done
echo "[$(date +%H:%M:%S)] v6 queue2: starting (v6_queue.sh finished)" >> $LOG

job(){  # job <scenario> <strategy> <label> <notes> [VAR=value ...]
  local scenario=$1 strategy=$2 label=$3 notes=$4; shift 4
  until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
    echo "[$(date +%H:%M:%S)] v6 queue2: Gemini API unreachable, waiting" >> $LOG; sleep 30
  done
  echo "[$(date +%H:%M:%S)] v6 queue2: starting $scenario $label" >> $LOG
  env SCENARIO=$scenario LABEL=$label "$@" ./4-load-testing/run_experiment.sh "$strategy" "$notes"
  echo "[$(date +%H:%M:%S)] v6 queue2: finished $scenario $label (exit $?)" >> $LOG
  .venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
  sleep 90
}

job badconfig llm llm-v6 "blind test: prompt v6, memory off (tools only); clean rollout history" AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig llm llm-v5 "blind test: prompt v5, memory off (hint, no rollback tool)"              AIOPS_PROMPT=v5 AIOPS_MEMORY=off
job badconfig llm llm    "blind test: prompt v4, memory off (no rollback tool)"                    AIOPS_PROMPT=v4 AIOPS_MEMORY=off
echo "[$(date +%H:%M:%S)] v6 queue2: all done (comparison.md regenerated)" >> $LOG
exit
}
