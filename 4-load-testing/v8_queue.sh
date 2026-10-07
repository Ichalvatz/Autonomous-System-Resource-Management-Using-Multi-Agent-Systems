#!/bin/bash
# 2026-10-03 21:45: validation of prompt v8 first, then the remaining comparison runs of v7_queue.sh.
# v8 = v7 + "diagnosis before a disruptive action" (restart / pod restart / rollback refused until all three
# observation tools were used) + evidence-based restart wording (check what changed first; restart only with
# evidence of a bad process state; a short SLO breach without evidence may be a transient -> no action).
# Why: v7 badconfig run 2 restarted after looking only at the per-pod view; v7 demo run 2 restarted a
# healthy pod for a transient latency blip. Fault runs: AIOPS_MEMORY=off; demo runs: memory on.
# The whole body is one { ... } block (safe against edits while it runs).
# Stop with: pkill -f v8_queue.sh; pkill -TERM -f run_experiment.sh
{
cd "$(dirname "$0")/.."
LOG=4-load-testing/queue.log
while pgrep -f "run_experiment.sh" >/dev/null; do sleep 20; done
echo "[$(date +%H:%M:%S)] v8 queue: starting" >> $LOG

job(){  # job <scenario> <strategy> <label> <notes> [VAR=value ...]
  local scenario=$1 strategy=$2 label=$3 notes=$4; shift 4
  if [ "$strategy" = "llm" ]; then
    until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
      echo "[$(date +%H:%M:%S)] v8 queue: Gemini API unreachable, waiting" >> $LOG; sleep 30
    done
  fi
  echo "[$(date +%H:%M:%S)] v8 queue: starting $scenario $label" >> $LOG
  env SCENARIO=$scenario LABEL=$label "$@" ./4-load-testing/run_experiment.sh "$strategy" "$notes"
  echo "[$(date +%H:%M:%S)] v8 queue: finished $scenario $label (exit $?)" >> $LOG
  .venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
  sleep 90
}

V8F="prompt v8, memory off (tools only)"
job badconfig llm   llm-v8   "$V8F"                                          AIOPS_PROMPT=v8 AIOPS_MEMORY=off
job baseline  llm   llm-v8   "prompt v8, memory on: normal scaling"           AIOPS_PROMPT=v8
job cpuhog    llm   llm-v8   "$V8F"                                          AIOPS_PROMPT=v8 AIOPS_MEMORY=off
job stuck     llm   llm-v8   "$V8F"                                          AIOPS_PROMPT=v8 AIOPS_MEMORY=off
job badconfig llm   llm-v8   "$V8F"                                          AIOPS_PROMPT=v8 AIOPS_MEMORY=off
job baseline  llm   llm-v8   "prompt v8, memory on: normal scaling"           AIOPS_PROMPT=v8
# --- remaining comparison runs
job badconfig llm   llm-v6   "blind test: prompt v6, memory off (tools only); clean rollout history" AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig llm   llm-v5   "blind test: prompt v5, memory off (hint, no rollback tool)" AIOPS_PROMPT=v5 AIOPS_MEMORY=off
job badconfig llm   llm      "blind test: prompt v4, memory off (no rollback tool)"       AIOPS_PROMPT=v4 AIOPS_MEMORY=off
job baseline  rules rules-v2 "rules v2: do the restart rules misfire on normal load?" RULES_RESTART=on
job baseline  rules rules    "extra run for statistics (2026-10-03)"
job baseline  hpa   hpa      "extra run for statistics (2026-10-03)"
job baseline  llm   llm-v6   "prompt v6, memory on: normal scaling, 38-min scenario" AIOPS_PROMPT=v6
echo "[$(date +%H:%M:%S)] v8 queue: all done (comparison.md regenerated)" >> $LOG
exit
}
