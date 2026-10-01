#!/bin/bash
# One comparable experiment: clean reset -> start ONE scaling strategy -> baseline.js
# (~40 min, 5→20→30→14→5 VUs) -> stop the strategy -> score with evaluate_run.py.
#
# Usage (from repo root):  ./4-load-testing/run_experiment.sh <strategy> [notes]
#   llm       anomaly detector + LLM agent (needs GEMINI_API_KEY, read from .env if unset)
#   rules     rule-based scaler (3-ai-agent/rule_scaler.py)
#   hpa       Kubernetes HPA on CPU (4-load-testing/baselines/hpa.yaml, needs metrics-server)
#   static-1  no autoscaling, 1 replica (lower bound on cost, upper bound on SLO damage)
#   static-3  no autoscaling, 3 replicas (the opposite)
#
# SCENARIO=stuck ./4-load-testing/run_experiment.sh <strategy>   (default SCENARIO=baseline)
#   fault_load.js (8 VUs, 16 min, 1-replica band); at t=4 min every backend pod gets
#   POST /chaos/stuck (requests wait 3 s on a "leaked DB connection", no CPU; only a
#   restart fixes it). Scored with recovery time into evaluation_results_stuck.csv.
# Output: 4-load-testing/eval_[stuck_]<strategy>_<time>/ + one row in the results CSV
set -u
cd "$(dirname "$0")/.."
STRATEGY=$1
NOTES=${2:-}
SCENARIO=${SCENARIO:-baseline}
case "$SCENARIO" in
  baseline) K6_SCRIPT=4-load-testing/baseline.js; PREFIX=""; RESULTS=4-load-testing/evaluation_results.csv ;;
  stuck)    K6_SCRIPT=4-load-testing/fault_load.js; PREFIX="stuck_"; RESULTS=4-load-testing/evaluation_results_stuck.csv ;;
  *) echo "unknown SCENARIO $SCENARIO"; exit 1 ;;
esac
FAULT_AFTER_SECONDS=240
OUT="4-load-testing/eval_${PREFIX}${STRATEGY}_$(date +%Y%m%d_%H%M)"
mkdir -p "$OUT"
PY=.venv/bin/python3
DEPLOY=deploy/aiops-backend-deployment
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/experiment.log"; }

stop_all_controllers(){
  pkill -TERM -f "3-ai-agent/anomaly_detector.py" 2>/dev/null
  pkill -TERM -f "3-ai-agent/rule_scaler.py" 2>/dev/null
  kubectl delete hpa aiops-backend-hpa --ignore-not-found >/dev/null 2>&1
  sleep 3
  # Background jobs of a non-interactive shell ignore SIGINT, and on 2026-10-01 a
  # leftover detector kept scaling during the HPA run. Never start with a stray controller.
  if pgrep -f "3-ai-agent/(anomaly_detector|rule_scaler).py" >/dev/null; then
    log "WARNING: stray controller still running after SIGTERM, killing: $(pgrep -f '3-ai-agent/(anomaly_detector|rule_scaler).py' | tr '\n' ' ')"
    pkill -9 -f "3-ai-agent/(anomaly_detector|rule_scaler).py"
    sleep 1
  fi
}
CTRL_PID=""
cleanup(){
  [ -n "$CTRL_PID" ] && kill -TERM "$CTRL_PID" 2>/dev/null && wait "$CTRL_PID" 2>/dev/null
  kubectl delete hpa aiops-backend-hpa --ignore-not-found >/dev/null 2>&1
  pkill -f "k6 run 4-load-testing/" 2>/dev/null
  [ -n "${INJECT_PID:-}" ] && { pkill -P "$INJECT_PID" 2>/dev/null; kill "$INJECT_PID" 2>/dev/null; }
}
trap cleanup EXIT
trap "exit 130" INT TERM
caffeinate -dimsu -w $$ &

stop_all_controllers
START_REPLICAS=1; [ "$STRATEGY" = "static-3" ] && START_REPLICAS=3
log "scenario=$SCENARIO strategy=$STRATEGY: reset to $START_REPLICAS replica(s)"
# Fresh pods for the fault scenario: a pod left stuck by an earlier run stays stuck.
[ "$SCENARIO" = "stuck" ] && kubectl rollout restart $DEPLOY >/dev/null
kubectl scale $DEPLOY --replicas=$START_REPLICAS >/dev/null
kubectl rollout status $DEPLOY --timeout=180s >/dev/null
sleep 120   # past the detector's 90 s settle window, host idle

case "$STRATEGY" in
  llm)
    if [ -z "${GEMINI_API_KEY:-}" ]; then
      GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'"); export GEMINI_API_KEY
    fi
    PYTHONUNBUFFERED=1 $PY 3-ai-agent/anomaly_detector.py > "$OUT/controller.log" 2>&1 & CTRL_PID=$! ;;
  rules)
    PYTHONUNBUFFERED=1 $PY 3-ai-agent/rule_scaler.py > "$OUT/controller.log" 2>&1 & CTRL_PID=$! ;;
  hpa)
    kubectl apply -f 4-load-testing/baselines/hpa.yaml | tee "$OUT/controller.log" ;;
  static-1|static-3) echo "no controller" > "$OUT/controller.log" ;;
  *) log "unknown strategy $STRATEGY"; exit 1 ;;
esac
sleep 5
[ -n "$CTRL_PID" ] && ! kill -0 "$CTRL_PID" 2>/dev/null && { log "controller died at start:"; tail -5 "$OUT/controller.log"; exit 1; }

date "+%Y-%m-%d %H:%M:%S" > "$OUT/window.txt"
if [ "$SCENARIO" = "stuck" ]; then
  (
    sleep $FAULT_AFTER_SECONDS
    date "+%Y-%m-%d %H:%M:%S" > "$OUT/fault_at.txt"
    for pod in $(kubectl get pods -l app=aiops-backend --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}'); do
      echo "[$(date +%H:%M:%S)] inject stuck -> $pod: $(kubectl exec "$pod" -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/stuck 2>&1)" >> "$OUT/experiment.log"
    done
  ) & INJECT_PID=$!
fi
log "k6 $(basename $K6_SCRIPT) started"
k6 run $K6_SCRIPT > "$OUT/k6.log" 2>&1
log "k6 finished (exit $?)"
date "+%Y-%m-%d %H:%M:%S" >> "$OUT/window.txt"
[ "$STRATEGY" = "hpa" ] && kubectl get hpa aiops-backend-hpa >> "$OUT/controller.log" 2>&1
cleanup; CTRL_PID=""

sleep 20  # let the last Prometheus samples land
FAULT_ARG=""; [ -f "$OUT/fault_at.txt" ] && FAULT_ARG="--fault-at $(cat "$OUT/fault_at.txt" | tr ' ' 'T')"
$PY 4-load-testing/evaluate_run.py --label "${LABEL:-$STRATEGY}" --run-dir "$OUT" --notes "$NOTES" \
  --results "$RESULTS" $FAULT_ARG | tee "$OUT/score.txt"
log "done"
