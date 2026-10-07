#!/bin/bash
# 2026-10-03 18:25: validation of prompt v7 (the final version) first, then the remaining comparison runs
# that were queued in v6_queue.sh / v6_queue2.sh / v6_queue3.sh (stopped and replaced by this file).
# v7 = v6's tools + a CLASSIFY step with code-computed facts (minimum replicas from the capacity table, CPU
# per request) + v4's explicit capacity tiers + two code-enforced guards (evidence before action; no claimed
# action without a tool call). Fault runs use AIOPS_MEMORY=off (tools only), demo runs memory on.
# The demo scenario is baseline_eval.js (the 38-min measured version), see run_experiment.sh.
# The whole body is one { ... } block (safe against edits while it runs).
# Stop with: pkill -f v7_queue.sh; pkill -TERM -f run_experiment.sh
{
cd "$(dirname "$0")/.."
LOG=4-load-testing/queue.log
while pgrep -f "run_experiment.sh" >/dev/null; do sleep 20; done
echo "[$(date +%H:%M:%S)] v7 queue: starting" >> $LOG

job(){  # job <scenario> <strategy> <label> <notes> [VAR=value ...]
  local scenario=$1 strategy=$2 label=$3 notes=$4; shift 4
  if [ "$strategy" = "llm" ]; then
    until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
      echo "[$(date +%H:%M:%S)] v7 queue: Gemini API unreachable, waiting" >> $LOG; sleep 30
    done
  fi
  echo "[$(date +%H:%M:%S)] v7 queue: starting $scenario $label" >> $LOG
  env SCENARIO=$scenario LABEL=$label "$@" ./4-load-testing/run_experiment.sh "$strategy" "$notes"
  echo "[$(date +%H:%M:%S)] v7 queue: finished $scenario $label (exit $?)" >> $LOG
  .venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
  sleep 90
}

V7F="prompt v7 (final), memory off (tools only)"
# --- v7 validation (the final version)
job baseline  llm   llm-v7   "prompt v7 (final), memory on: normal scaling"  AIOPS_PROMPT=v7
job cpuhog    llm   llm-v7   "$V7F"                                         AIOPS_PROMPT=v7 AIOPS_MEMORY=off
job badconfig llm   llm-v7   "$V7F"                                         AIOPS_PROMPT=v7 AIOPS_MEMORY=off
job stuck     llm   llm-v7   "$V7F"                                         AIOPS_PROMPT=v7 AIOPS_MEMORY=off
job baseline  llm   llm-v7   "prompt v7 (final), memory on: normal scaling"  AIOPS_PROMPT=v7
job badconfig llm   llm-v7   "$V7F"                                         AIOPS_PROMPT=v7 AIOPS_MEMORY=off
job cpuhog    llm   llm-v7   "$V7F"                                         AIOPS_PROMPT=v7 AIOPS_MEMORY=off
# --- remaining comparison runs (from the stopped queues)
job cpuhog    llm   llm-v6   "prompt v6, memory off (tools only)"           AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig llm   llm-v6   "blind test: prompt v6, memory off (tools only); clean rollout history" AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig llm   llm-v5   "blind test: prompt v5, memory off (hint, no rollback tool)" AIOPS_PROMPT=v5 AIOPS_MEMORY=off
job badconfig llm   llm      "blind test: prompt v4, memory off (no rollback tool)"       AIOPS_PROMPT=v4 AIOPS_MEMORY=off
job baseline  llm   llm-v6   "prompt v6, memory on: normal scaling, 38-min scenario" AIOPS_PROMPT=v6
job baseline  rules rules-v2 "rules v2: do the restart rules misfire on normal load?" RULES_RESTART=on
job baseline  rules rules    "extra run for statistics (2026-10-03)"
job baseline  hpa   hpa      "extra run for statistics (2026-10-03)"
echo "[$(date +%H:%M:%S)] v7 queue: all done (comparison.md regenerated)" >> $LOG
exit
}
