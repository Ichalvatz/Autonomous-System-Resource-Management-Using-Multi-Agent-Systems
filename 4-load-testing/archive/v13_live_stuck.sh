#!/bin/bash
# Agent v13: the stuck smoke run the user asked for after the live checks (2026-11-03, "μετά βάλε και το σφάλμα stuck").
# Waits until v13_live_queue.sh has finished, then for AC power and the LLM, and runs SCENARIO=stuck (memory off), notes
# smoke-v13-2026-11-03: the restart's verification on post-change readings (v12: STABLE ~60 s after the rollout, while
# the errors left the 1 m window; expected now ~20 s).
# Run from the repo root:  nohup ./4-load-testing/archive/v13_live_stuck.sh &   (log: 4-load-testing/v13_live_queue.log)
{
set -u
cd "$(dirname "$0")/../.."
LOG=4-load-testing/v13_live_queue.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
power(){ pmset -g batt | head -1 | grep -q "AC Power" && echo AC || echo BATTERY; }
caffeinate -dimsu -w $$ &

log "stuck smoke queued: waits for v13_live_queue.sh to finish"
while pgrep -f v13_live_queue.sh >/dev/null; do sleep 30; done
until [ "$(power)" = AC ]; do log "on battery: waiting for AC power"; sleep 60; done
until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
log "smoke stuck llm (memory off); git HEAD $(git rev-parse --short HEAD); power $(power)"
env SCENARIO=stuck AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm smoke-v13-2026-11-03 >> "$LOG.runs" 2>&1
log "end smoke stuck (exit $?)"
kubectl scale deployment aiops-backend-deployment --replicas=1 >/dev/null
log "v13 stuck smoke done"
exit
}
