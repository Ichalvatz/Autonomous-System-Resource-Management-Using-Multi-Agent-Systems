#!/bin/bash
# 2026-10-01 day: more v4 samples after day_followon.sh (which ends with 2 more "all done" lines).
cd "$(dirname "$0")/.."
until [ "$(grep -c 'queue: all done' 4-load-testing/queue.log)" -ge 5 ]; do sleep 20; done
sleep 60
SCENARIO=stuck QUEUE_NOTES="stuck fault, agent v4 (bottleneck-first Tier 1 prompt; v3.2 verification)" \
  ./4-load-testing/queue.sh llm llm
SCENARIO=baseline QUEUE_NOTES="agent v4 (baseline scenario)" \
  ./4-load-testing/queue.sh llm
