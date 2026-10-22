#!/bin/bash
# Replaces the contaminated 00:06 HPA run: after the main queue, run hpa + llm once more.
cd "$(dirname "$0")/.."
until grep -q "queue: all done" 4-load-testing/queue.log; do sleep 20; done
sleep 60
QUEUE_NOTES="agent v3: metric memory, rollout+45s SLO verification, rollback" \
  ./4-load-testing/queue.sh hpa llm
