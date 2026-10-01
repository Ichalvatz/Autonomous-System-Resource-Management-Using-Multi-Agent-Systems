#!/bin/bash
# 2026-10-01 day: stuck-dependency fault comparison, after the first LLM probe run.
cd "$(dirname "$0")/.."
until grep -q "done" 4-load-testing/eval_stuck_llm_20261001_0805/experiment.log 2>/dev/null; do sleep 15; done
sleep 120
SCENARIO=stuck QUEUE_NOTES="stuck fault, agent v3.1 (40s-window verification)" \
  ./4-load-testing/queue.sh rules hpa static-1 llm rules hpa llm
