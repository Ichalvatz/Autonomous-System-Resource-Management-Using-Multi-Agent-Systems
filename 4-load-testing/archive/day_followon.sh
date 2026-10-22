#!/bin/bash
# 2026-10-01 day: after the stuck queue, 2 more LLM stuck runs (v3.2, memory reuse) + 1 baseline LLM run
# (regression check of the scaling path with the new verification).
cd "$(dirname "$0")/.."
n0=$(grep -c "queue: all done" 4-load-testing/queue.log)
until [ "$(grep -c 'queue: all done' 4-load-testing/queue.log)" -gt "$n0" ]; do sleep 20; done
sleep 60
SCENARIO=stuck QUEUE_NOTES="stuck fault, agent v4 (bottleneck-first Tier 1 prompt; v3.2 verification)" \
  ./4-load-testing/queue.sh llm llm
SCENARIO=baseline QUEUE_NOTES="agent v4 regression check (baseline scenario)" \
  ./4-load-testing/queue.sh llm
