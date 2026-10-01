#!/bin/bash
# 2026-10-01 day: RAG ablation, 2 stuck-fault runs with incident memory OFF (prompt v4).
cd "$(dirname "$0")/.."
until [ "$(grep -c 'queue: all done' 4-load-testing/queue.log)" -ge 7 ]; do sleep 20; done
sleep 60
SCENARIO=stuck AIOPS_MEMORY=off LABEL=llm-nomem QUEUE_NOTES="stuck fault, agent v4, incident memory OFF (RAG ablation)" \
  ./4-load-testing/queue.sh llm llm
