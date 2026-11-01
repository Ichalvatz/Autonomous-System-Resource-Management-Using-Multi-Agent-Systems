#!/bin/bash
# Agent v12, live steps before the campaign (2026-11-01, design_decisions.md A31): one-off queue.
#   1. save the incident memory and empty it;
#   2. idle check (dry run, no agent): 1 pod at 1.5, 3 and 1.2 rps, 4 min each; expected: no anomalous reading;
#   3. live detector validation with the v12 model (detector_validation.sh, ~34 min, dry run, no agent);
#   4. UNSTABLE test (agent live, memory off): 280 rps, above the 3-pod ceiling (safe 255, 0.35 s breaks at 270 rps),
#      reached in 30 s from 40 rps and held 7 min, then 40 rps for 3.5 min. Expected: scale to 3, verification
#      UNSTABLE (3 pods cannot serve it), a re-wake, then no further action (nothing left to do), and 3->1 at 40 rps;
#   5. smoke runs of the agent: stuck, cpuhog (memory off) and the normal load (memory on), notes smoke-v12-2026-11-01.
# The user allowed running on battery (2026-11-01); the power state is logged, not waited for. An agent run waits until
# llm_ready.py gets 3/3 answers. The campaign itself is started separately (full_campaign.sh), only after the user's OK.
# Run from the repo root:  ./4-load-testing/archive/v12_live_queue.sh   (log: 4-load-testing/v12_live_queue.log)
{
set -u
cd "$(dirname "$0")/../.."
LOG=4-load-testing/v12_live_queue.log
PY=.venv/bin/python3
TAG=smoke-v12-2026-11-01
IDLE=4-load-testing/archive/idle_check_2026-11-01
UNST=4-load-testing/archive/unstable_test_2026-11-01
TOKENS="$PWD/5-ml-training/k6_tokens.json"
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
power(){ pmset -g batt | head -1 | grep -q "AC Power" && echo AC || echo BATTERY; }
fresh_one_pod(){
  kubectl scale deployment aiops-backend-deployment --replicas=1 >/dev/null
  kubectl rollout restart deployment aiops-backend-deployment >/dev/null
  kubectl rollout status deployment aiops-backend-deployment --timeout=180s >/dev/null
  sleep 10   # the ingress still routes to the old pod for a few seconds (a login got 502 at 15:53 without this)
  for try in 1 2 3 4 5; do
    (cd 5-ml-training && ../$PY -c "import k6_driver; k6_driver.make_token_pool()") >> "$LOG" 2>&1 && break
    log "token pool: login failed (try $try), retry in 10 s"; sleep 10
  done
  sleep 120   # past the detector's 90 s settle window, host idle
}
series(){  # series.json of [start, now] into $1 (Prometheus keeps 10 days)
  $PY - "$1" "$2" <<'EOF'
import json, sys, time
from datetime import datetime
sys.path.insert(0, "3-ai-agent")
import nfr_metrics
start = datetime.strptime(sys.argv[2], "%Y-%m-%d %H:%M:%S").timestamp()
s = nfr_metrics.fetch_range(start, time.time(), 10)
json.dump({k: {str(t): v for t, v in x.items()} for k, x in s.items()}, open(sys.argv[1] + "/series.json", "w"))
EOF
}
caffeinate -dimsu -w $$ &
mkdir -p "$IDLE" "$UNST"

log "v12 live queue: git HEAD $(git rev-parse --short HEAD); model $(shasum -a 256 5-ml-training/health_model.pkl | cut -c1-12); power $(power)"
SNAP=4-load-testing/archive/memory_snapshots/chroma_snapshot_2026-11-01_before_v12.json
if [ -f "$SNAP" ]; then   # a restarted queue must not overwrite the snapshot with the emptied memory
  log "memory snapshot already saved ($SNAP); memory already emptied"
else
  $PY 3-ai-agent/memory_snapshot.py save "$SNAP" >> "$LOG" 2>&1
  $PY reset_chroma.py >> "$LOG" 2>&1
fi

# --- 2. idle check
log "idle check (dry run): 1 pod at 1.5 / 3 / 1.2 rps; power $(power)"
fresh_one_pod
date "+%Y-%m-%d %H:%M:%S" > "$IDLE/window.txt"
PYTHONUNBUFFERED=1 $PY 3-ai-agent/anomaly_detector.py --dry-run > "$IDLE/detector.log" 2>&1 & DET=$!
for rate in 1.5 3 1.2; do
  echo "$(date +%H:%M:%S) rate $rate" >> "$IDLE/levels.txt"
  k6 run --quiet -e TOKENS_FILE="$TOKENS" -e RATE=$rate -e DURATION=240s 4-load-testing/k6/constant_rate.js >> "$IDLE/k6.log" 2>&1
done
kill $DET 2>/dev/null; sleep 2
date "+%Y-%m-%d %H:%M:%S" >> "$IDLE/window.txt"
mv 5-ml-training/dry_run_readings.csv "$IDLE/dry_run_readings.csv"
series "$IDLE" "$(head -1 $IDLE/window.txt)"
log "idle check done: $(tail -n +2 $IDLE/dry_run_readings.csv | wc -l | tr -d ' ') readings scored, $(awk -F, 'NR>1 && $9==-1' $IDLE/dry_run_readings.csv | wc -l | tr -d ' ') anomalous, $(grep -c ',True$' $IDLE/dry_run_readings.csv) would wake; power $(power)"
sleep 60

# --- 3. detector validation
log "detector validation (dry run, v12 model); power $(power)"
( while kill -0 $$ 2>/dev/null; do echo "$(date +%H:%M:%S) $(power)"; sleep 30; done ) \
  > 4-load-testing/detector_validation_power.log 2>/dev/null &
POWER=$!
./4-load-testing/detector_validation.sh >> "$LOG" 2>&1
kill $POWER 2>/dev/null
$PY 4-load-testing/analyze_validation.py > 4-load-testing/detector_validation.out 2>&1
log "validation done: $(grep -c BATTERY 4-load-testing/detector_validation_power.log) battery samples"
sleep 180

# --- 4. UNSTABLE test
until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
log "UNSTABLE test (agent live, memory off): 280 rps above the 3-pod ceiling; power $(power)"
fresh_one_pod
if [ -z "${GEMINI_API_KEY:-}" ]; then
  GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'"); export GEMINI_API_KEY
fi
date "+%Y-%m-%d %H:%M:%S" > "$UNST/window.txt"
AIOPS_MEMORY=off PYTHONUNBUFFERED=1 $PY 3-ai-agent/anomaly_detector.py > "$UNST/controller.log" 2>&1 & CTRL=$!
sleep 5
k6 run --quiet -e TOKENS_FILE="$TOKENS" -e START=40 -e 'STAGES=[[280,"30s"],[280,"7m"],[40,"30s"],[40,"3m30s"]]' \
  4-load-testing/k6/ramp_rate.js > "$UNST/k6.log" 2>&1
kill -TERM $CTRL 2>/dev/null; sleep 5
date "+%Y-%m-%d %H:%M:%S" >> "$UNST/window.txt"
series "$UNST" "$(head -1 $UNST/window.txt)"
kubectl get events --sort-by=.lastTimestamp > "$UNST/events.txt" 2>&1
log "UNSTABLE test done: $(grep -c 'ANOMALY DETECTED\|RE-WAKE' $UNST/controller.log) wake-up(s); $(grep -c 'verified STABLE' $UNST/controller.log) STABLE, $(grep -c 'not confirmed' $UNST/controller.log) not confirmed"
sleep 180

# --- 5. smoke runs
for scenario in stuck cpuhog baseline; do
  memory=on; [ "$scenario" != baseline ] && memory=off
  until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
  log "smoke $scenario llm (memory $memory); power $(power)"
  env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end smoke $scenario (exit $?)"
  sleep 180
done
kubectl scale deployment aiops-backend-deployment --replicas=1 >/dev/null
log "v12 live queue done"
exit
}
