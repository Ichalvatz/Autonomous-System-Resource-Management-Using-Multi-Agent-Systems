#!/bin/bash
# Overnight agent experiment: one live detector (real agent, real scaling) for the
# whole night, and N back-to-back runs of baseline.js (1→2→3→2→1 demo, ~40 min each).
# Every run starts from a clean state: 1 replica, settled, host idle for a few minutes.
#
# Usage (from repo root):  ./4-load-testing/night_run.sh [RUNS]      default 10 (~8 h)
# Output: 4-load-testing/night_<date>/  (detector.log, k6_runN.log, runs.csv)
#         + one row per agent wake-up in 3-ai-agent/incident_log.csv
set -u
cd "$(dirname "$0")/.."
RUNS=${1:-10}
IDLE_BETWEEN_RUNS=300
OUT="4-load-testing/night_$(date +%Y%m%d_%H%M)"
mkdir -p "$OUT"
PY=.venv/bin/python3

log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/night.log"; }

# Key from the root .env, never printed.
if [ -z "${GEMINI_API_KEY:-}" ]; then
  GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'")
  export GEMINI_API_KEY
fi
[ -n "$GEMINI_API_KEY" ] || { log "GEMINI_API_KEY missing"; exit 1; }

prom_ok(){ curl -s -m 5 --get http://prometheus.aiops/api/v1/query --data-urlencode 'query=up' | grep -q '"success"'; }
chroma_ok(){ curl -s -m 5 -o /dev/null -w '%{http_code}' http://chromadb.aiops/api/v2/heartbeat | grep -q 200; }
wait_healthy(){
  for _ in $(seq 1 60); do
    if prom_ok && chroma_ok && kubectl rollout status deploy/aiops-backend-deployment --timeout=5s >/dev/null 2>&1; then return 0; fi
    sleep 10
  done
  return 1
}

DETECTOR_PID=""
start_detector(){
  PYTHONUNBUFFERED=1 $PY 3-ai-agent/anomaly_detector.py >> "$OUT/detector.log" 2>&1 &
  DETECTOR_PID=$!
  log "detector started (pid $DETECTOR_PID)"
}
cleanup(){
  log "stopping"
  [ -n "$DETECTOR_PID" ] && kill -TERM "$DETECTOR_PID" 2>/dev/null
  pkill -f "k6 run 4-load-testing/baseline.js" 2>/dev/null
  [ -n "$DETECTOR_PID" ] && wait "$DETECTOR_PID" 2>/dev/null
}
trap cleanup EXIT
trap "exit 130" INT TERM

# Keep the Mac awake for as long as this script runs.
caffeinate -dimsu -w $$ &

echo "run,start,end,k6_exit,incidents_during_run" > "$OUT/runs.csv"
wait_healthy || { log "cluster not healthy, aborting"; exit 1; }
start_detector

for run in $(seq 1 "$RUNS"); do
  if ! wait_healthy; then log "run $run: cluster unhealthy for 10 min, stopping"; break; fi
  kill -0 "$DETECTOR_PID" 2>/dev/null || { log "detector died, restarting"; start_detector; }

  # Clean start: 1 replica, settled past the detector's 90 s replica-settle window.
  if [ "$(kubectl get deploy aiops-backend-deployment -o jsonpath='{.spec.replicas}')" != "1" ]; then
    log "run $run: reset to 1 replica (agent left $(kubectl get deploy aiops-backend-deployment -o jsonpath='{.spec.replicas}'))"
    kubectl scale deploy/aiops-backend-deployment --replicas=1 >/dev/null
    kubectl rollout status deploy/aiops-backend-deployment --timeout=120s >/dev/null
    sleep 120
  fi

  before=$( [ -f 3-ai-agent/incident_log.csv ] && tail -n +2 3-ai-agent/incident_log.csv | wc -l | tr -d ' ' || echo 0)
  start=$(date +%H:%M:%S)
  log "run $run/$RUNS: k6 baseline.js started"
  k6 run 4-load-testing/baseline.js > "$OUT/k6_run$run.log" 2>&1
  k6_exit=$?
  after=$( [ -f 3-ai-agent/incident_log.csv ] && tail -n +2 3-ai-agent/incident_log.csv | wc -l | tr -d ' ' || echo 0)
  log "run $run/$RUNS: k6 finished (exit $k6_exit), agent runs this round: $((after - before))"
  echo "$run,$start,$(date +%H:%M:%S),$k6_exit,$((after - before))" >> "$OUT/runs.csv"

  [ "$run" -lt "$RUNS" ] && { log "idle ${IDLE_BETWEEN_RUNS}s"; sleep "$IDLE_BETWEEN_RUNS"; }
done
log "all runs done"
