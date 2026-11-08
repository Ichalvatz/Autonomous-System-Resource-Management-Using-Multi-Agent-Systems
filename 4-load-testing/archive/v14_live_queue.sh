#!/bin/bash
# Agent v14 (A33, the final prompt; A34, the investigation with the data and the logs), smoke runs before its campaign:
# one-off queue. The user gave full autonomy for this and the campaign after it ("μην σταματήσεις για τίποτα"), and
# starts it by hand (v14_finish.sh).
#   stuck and cpuhog (memory off) and the normal load (memory on: the incidents of campaign-2026-11-01, the v13 smoke
#   runs and the hand tests of 8/11, in the same model's space), notes smoke-v14-<date> (or the tag given): the new
#   prompt and tools live, with the verification and the detector of v13. 4-load-testing/smoke_gate.py <tag> checks them.
# Every run waits for AC power and until llm_ready.py gets 3/3 answers. The campaign is started separately
# (4-load-testing/v14_finish.sh runs this queue, the gate and then the campaign).
# Run from the repo root:  nohup ./4-load-testing/archive/v14_live_queue.sh [tag] &   (log: 4-load-testing/v14_live_queue.log)
{
set -u
cd "$(dirname "$0")/../.."
LOG=4-load-testing/v14_live_queue.log
PY=.venv/bin/python3
TAG=${1:-smoke-v14-$(date +%Y-%m-%d)}
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
power(){ pmset -g batt | head -1 | grep -q "AC Power" && echo AC || echo BATTERY; }
wait_ac(){ until [ "$(power)" = AC ]; do log "on battery: waiting for AC power"; sleep 60; done; }
caffeinate -dimsu -w $$ &

log "v14 smoke queue: git HEAD $(git rev-parse --short HEAD); model $(shasum -a 256 5-ml-training/health_model.pkl | cut -c1-12); power $(power)"
for scenario in stuck cpuhog baseline; do
  memory=on; [ "$scenario" != baseline ] && memory=off
  wait_ac
  until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
  log "smoke $scenario llm (memory $memory); power $(power)"
  env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end smoke $scenario (exit $?)"
  sleep 180
done
kubectl scale deployment aiops-backend-deployment --replicas=1 >/dev/null
log "v14 smoke queue done"
exit
}
