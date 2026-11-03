#!/bin/bash
# Agent v13, live checks before its campaign (2026-11-03, design_decisions.md A32, A32.1): one-off queue.
#   0. wait for AC power before every step (DELAY seconds first, default 0);
#   1. live detector validation with v13's detector (detector_validation.sh, ~34 min, dry run, no agent): the script
#      scales by hand, so every change is one no verification watched: the detector follows it on readings of
#      post-change data only (A32, A32.1); expected as v12: the anomaly phases caught, no wake-up in the normal ones;
#   2. a smoke run of the agent on the normal load (memory on: the incidents of campaign-2026-11-01, in the same model's
#      space), notes smoke-v13-2026-11-03: the verification on post-change readings (expected STABLE ~20 s after the
#      rollout) and the detector right after it. (The user asked for a check of about an hour: no fault run.)
# An agent run waits until llm_ready.py gets 3/3 answers. The campaign is started separately, only after the user's OK.
# Run from the repo root:  nohup ./4-load-testing/archive/v13_live_queue.sh &   (log: 4-load-testing/v13_live_queue.log)
{
set -u
cd "$(dirname "$0")/../.."
LOG=4-load-testing/v13_live_queue.log
PY=.venv/bin/python3
TAG=smoke-v13-2026-11-03
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
power(){ pmset -g batt | head -1 | grep -q "AC Power" && echo AC || echo BATTERY; }
wait_ac(){ until [ "$(power)" = AC ]; do log "on battery: waiting for AC power"; sleep 60; done; }
caffeinate -dimsu -w $$ &

log "v13 live queue: git HEAD $(git rev-parse --short HEAD); model $(shasum -a 256 5-ml-training/health_model.pkl | cut -c1-12); noise $(shasum -a 256 5-ml-training/window_noise.json | cut -c1-12); starting in ${DELAY:-0} s"
sleep "${DELAY:-0}"

# --- 1. detector validation
wait_ac
log "detector validation (dry run, v13 detector); power $(power)"
( while kill -0 $$ 2>/dev/null; do echo "$(date +%H:%M:%S) $(power)"; sleep 30; done ) \
  > 4-load-testing/detector_validation_power.log 2>/dev/null &
POWER=$!
./4-load-testing/detector_validation.sh >> "$LOG" 2>&1
kill $POWER 2>/dev/null
$PY 4-load-testing/analyze_validation.py > 4-load-testing/detector_validation.out 2>&1
$PY - <<'EOF'
# the validation's full series (Prometheus keeps 10 days), as the earlier validations keep it
import json, sys, time
from datetime import datetime
sys.path.insert(0, "3-ai-agent")
import nfr_metrics
first = open("4-load-testing/detector_validation_phases.csv").readlines()[1].split(",")[0]
start = datetime.strptime(time.strftime("%Y-%m-%d ") + first, "%Y-%m-%d %H:%M:%S").timestamp()
s = nfr_metrics.fetch_range(int(start), int(time.time()), step=10)
json.dump({k: {str(t): v for t, v in x.items()} for k, x in s.items()},
          open("4-load-testing/detector_validation_series.json", "w"))
EOF
log "validation done: $(grep -c BATTERY 4-load-testing/detector_validation_power.log) battery samples; $(tail -n +2 5-ml-training/dry_run_readings.csv | wc -l | tr -d ' ') readings, $(grep -c ',True$' 5-ml-training/dry_run_readings.csv) would wake"
sleep 180

# --- 2. smoke run
for scenario in baseline; do
  memory=on; [ "$scenario" != baseline ] && memory=off
  wait_ac
  until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
  log "smoke $scenario llm (memory $memory); power $(power)"
  env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end smoke $scenario (exit $?)"
  sleep 180
done
kubectl scale deployment aiops-backend-deployment --replicas=1 >/dev/null
log "v13 live queue done"
exit
}
