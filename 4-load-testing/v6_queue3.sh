#!/bin/bash
# Overnight follow-up (prepared 2026-10-03 18:00): the evidence-before-action guard.
# In the v6 cpuhog run of 15:29 the LLM wrote observation + scale-up + final_answer in one code
# block (decided before seeing the evidence; only a syntax error stopped it). The guard makes
# "look, then act" a code-enforced rule (AIOPS_ACT_GUARD=on). It is applied to the code only AFTER
# every frozen-v6 run has finished, so none of them ran with a modified agent_tools.py/agent.py.
# Steps: wait for v6_queue.sh and v6_queue2.sh -> apply the patch -> run all unit tests (abort on
# failure) -> log hashes -> runs labelled llm-v6-guard.
# The whole body is one { ... } block (safe against edits while it runs).
{
cd "$(dirname "$0")/.."
LOG=4-load-testing/queue.log
while pgrep -f "v6_queue.sh|v6_queue2.sh" >/dev/null; do sleep 60; done
echo "[$(date +%H:%M:%S)] v6 queue3: applying the evidence-before-action guard" >> $LOG
if ! grep -q "ACT_GUARD" 3-ai-agent/agent_tools.py; then
  .venv/bin/python3 4-load-testing/patches/apply_act_guard.py 3-ai-agent >> $LOG 2>&1 || { echo "[$(date +%H:%M:%S)] v6 queue3: patch FAILED, abort" >> $LOG; exit 1; }
  cp 4-load-testing/patches/test_act_guard.py 3-ai-agent/tests/test_act_guard.py
fi
if ! .venv/bin/python3 -m pytest 3-ai-agent/tests -q >> $LOG 2>&1; then
  echo "[$(date +%H:%M:%S)] v6 queue3: unit tests FAILED after the patch, abort" >> $LOG; exit 1
fi
echo "[$(date +%H:%M:%S)] v6 queue3: tests pass; hashes:" >> $LOG
shasum -a 256 3-ai-agent/agent.py 3-ai-agent/agent_tools.py >> $LOG

job(){  # job <scenario> <label> <notes> [VAR=value ...]
  local scenario=$1 label=$2 notes=$3; shift 3
  until curl -s -o /dev/null --max-time 10 https://generativelanguage.googleapis.com/; do
    echo "[$(date +%H:%M:%S)] v6 queue3: Gemini API unreachable, waiting" >> $LOG; sleep 30
  done
  echo "[$(date +%H:%M:%S)] v6 queue3: starting $scenario $label" >> $LOG
  env SCENARIO=$scenario LABEL=$label "$@" ./4-load-testing/run_experiment.sh llm "$notes"
  echo "[$(date +%H:%M:%S)] v6 queue3: finished $scenario $label (exit $?)" >> $LOG
  .venv/bin/python3 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1
  sleep 90
}
G="prompt v6 + evidence-before-action guard, memory off"
job cpuhog    llm-v6-guard "$G" AIOPS_PROMPT=v6 AIOPS_MEMORY=off AIOPS_ACT_GUARD=on
job badconfig llm-v6-guard "$G" AIOPS_PROMPT=v6 AIOPS_MEMORY=off AIOPS_ACT_GUARD=on
job cpuhog    llm-v6-guard "$G" AIOPS_PROMPT=v6 AIOPS_MEMORY=off AIOPS_ACT_GUARD=on
job stuck     llm-v6-guard "$G" AIOPS_PROMPT=v6 AIOPS_MEMORY=off AIOPS_ACT_GUARD=on
job baseline  llm-v6-guard "prompt v6 + guard, memory on: regression check on normal scaling" AIOPS_PROMPT=v6 AIOPS_ACT_GUARD=on
echo "[$(date +%H:%M:%S)] v6 queue3: all done (comparison.md regenerated)" >> $LOG
exit
}
