#!/bin/bash
# 2026-10-03: prompt v6 (investigation tools, no fault-specific hint) and rules v2 (restart rules)
# on the two known faults, the blind "bad configuration change" fault, and the normal demo.
# Interleaved so the most decisive results come first. Fault runs of v6 use AIOPS_MEMORY=off:
# the question is whether the TOOLS let the agent find the cause (memory already held the
# cpuhog fix, which would confound it). The v6 demo run keeps memory on, like the v4 demo runs.
# Stop with: pkill -f v6_queue.sh; pkill -TERM -f run_experiment.sh
# The whole body is one { ... } block: bash parses it completely before running, so editing
# this file while it runs cannot break the running copy (an edit at 14:44 on 2026-10-03 did).
{
cd "$(dirname "$0")/.."
LOG=4-load-testing/queue.log

job(){  # job <scenario> <strategy> <label> <notes> [VAR=value ...]
  local scenario=$1 strategy=$2 label=$3 notes=$4; shift 4
  if [ "$strategy" = "llm" ]; then
    until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
      echo "[$(date +%H:%M:%S)] v6 queue: Gemini API unreachable, waiting" >> $LOG; sleep 30
    done
  fi
  echo "[$(date +%H:%M:%S)] v6 queue: starting $scenario $label" >> $LOG
  env SCENARIO=$scenario LABEL=$label "$@" ./4-load-testing/run_experiment.sh "$strategy" "$notes"
  echo "[$(date +%H:%M:%S)] v6 queue: finished $scenario $label (exit $?)" >> $LOG
  .venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
  sleep 90
}

V6="prompt v6, memory off (tools only)"
job badconfig llm   llm-v6   "blind test: $V6"                       AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job cpuhog    llm   llm-v6   "$V6"                                    AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig rules rules-v2 "blind test: rules v2 (R1 stuck, R2 runaway)" RULES_RESTART=on
job stuck     llm   llm-v6   "$V6"                                    AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job badconfig hpa   hpa      "blind test"
job cpuhog    rules rules-v2 "rules v2 (R1 stuck, R2 runaway)"        RULES_RESTART=on
job badconfig llm   llm-v6   "blind test: $V6"                       AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job stuck     rules rules-v2 "rules v2 (R1 stuck, R2 runaway)"        RULES_RESTART=on
job baseline  llm   llm-v6   "prompt v6, memory on: regression check on normal scaling" AIOPS_PROMPT=v6
job badconfig rules rules    "blind test: rules v1 (scaling only)"
job cpuhog    llm   llm-v6   "$V6"                                    AIOPS_PROMPT=v6 AIOPS_MEMORY=off
job baseline  rules rules-v2 "rules v2: do the restart rules misfire on normal load?" RULES_RESTART=on
job baseline  rules rules    "extra run for statistics (2026-10-03)"
job baseline  hpa   hpa      "extra run for statistics (2026-10-03; repeat of the 14:20 run aborted by a script edit)"
echo "[$(date +%H:%M:%S)] v6 queue: all done (comparison.md regenerated)" >> $LOG
exit
}
