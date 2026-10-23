#!/bin/bash
# One-off (2026-10-23): the agent's smoke runs again after two fixes found in smoke-2026-10-23 (k6 token pool
# outside the measured window; facts sized with headroom and the load trend). The HPA runs of that smoke stay
# valid (neither change touches them). Same protocol as full_campaign.sh: AC power, llm_ready, memory off for faults.
cd "$(dirname "$0")/../.." || exit 1
TAG=smoke2-2026-10-23
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
caffeinate -dimsu -w $$ &
log "git HEAD $(git rev-parse --short HEAD)"
shasum -a 256 3-ai-agent/agent.py 3-ai-agent/agent_tools.py 3-ai-agent/anomaly_detector.py 3-ai-agent/health_model.py \
  3-ai-agent/nfr_metrics.py 5-ml-training/health_model.pkl 4-load-testing/k6/lib/mix.js >> "$LOG"
for item in stuck:off cpuhog:off baseline:on; do
  scenario=${item%%:*}; memory=${item#*:}
  until pmset -g batt | head -1 | grep -q "AC Power"; do sleep 60; done
  until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done
  log "start $scenario llm (memory $memory)"
  env SCENARIO=$scenario AIOPS_MEMORY=$memory ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end   $scenario llm (exit $?)"
  sleep 180
done
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" && log "report: 4-load-testing/${TAG}.md"
log "done"
