#!/bin/bash
# 2026-10-01 overnight plan: finish night run 1 (LLM agent v2), stop that loop,
# score it, then run the strategy comparison queue.
cd "$(dirname "$0")/.."
N=4-load-testing/night_20260930_2325
until grep -q "run 1/10: k6 finished" $N/night.log; do sleep 5; done
kill -9 41884 2>/dev/null                               # night_run.sh loop
pkill -TERM -f "3-ai-agent/anomaly_detector.py"
echo "[$(date +%H:%M:%S)] loop stopped after run 1 (overnight_controller)" >> $N/night.log
END=$(date "+%Y-%m-%d %H:%M:%S")
sleep 20
.venv/bin/python3 4-load-testing/evaluate_run.py --label llm --start "2026-09-30 23:25:15" --end "$END" \
  --notes "agent v2: LLM decides+acts, code verifies(20s)/saves, embedding memory" > $N/score.txt 2>&1
sleep 60
QUEUE_NOTES="agent v3: metric memory, rollout+45s SLO verification, rollback" \
  ./4-load-testing/queue.sh hpa rules llm static-1 static-3 llm hpa rules
