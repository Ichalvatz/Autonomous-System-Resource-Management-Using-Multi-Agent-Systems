#!/bin/bash
# One comparable experiment: clean reset -> start ONE scaling strategy -> the scenario's k6 script
# (4-load-testing/k6/<SCENARIO>.js; baseline: 38 min, 5→20→30→14→5 VUs) -> stop the strategy -> score with
# evaluate_run.py.
#
# Usage (from repo root):  ./4-load-testing/run_experiment.sh <strategy> [notes]
#   llm       anomaly detector + LLM agent (needs GEMINI_API_KEY, read from .env if unset)
#   rules     rule-based scaler (3-ai-agent/rule_scaler.py)
#   hpa       Kubernetes HPA on CPU (4-load-testing/baselines/hpa.yaml, needs metrics-server)
#   static-1  no autoscaling, 1 replica (lower bound on cost, upper bound on SLO damage)
#   static-3  no autoscaling, 3 replicas (the opposite)
#
# SCENARIO=stuck ./4-load-testing/run_experiment.sh <strategy>   (default SCENARIO=baseline)
#   k6/stuck.js (8 VUs, 16 min, 1-replica band); at t=4 min every backend pod gets
#   POST /chaos/stuck (requests wait 3 s on a "leaked DB connection", no CPU; only a
#   restart fixes it). Scored with recovery time into evaluation_results_stuck.csv.
# SCENARIO=cpuhog: k6/cpuhog.js, same load and timing, but POST /chaos/cpuhog (a background job that
#   never ends and blocks the event loop 600 ms at a time: CPU ~0.9, throttling ~18%,
#   p95 ~0.5 s at only ~4 rps). Looks like overload, but only a restart fixes it. Added
#   after prompt v4 was frozen: a blind test. Results in evaluation_results_cpuhog.csv.
# SCENARIO=badconfig: k6/badconfig.js, same load and timing, but at t=4 min "someone else" deploys a config
#   change (kubectl set env FEATURE_LOGIN_AUDIT=true): every login then runs a synchronous
#   PBKDF2 (1.5M iterations). The bad state lives in the deployment, not in the processes:
#   restarts and new pods do not help, only a rollback does. Designed after prompt v6 was
#   frozen (2026-10-03): the blind test for v6. Results in evaluation_results_badconfig.csv.
# Env switches passed through to the controller: AIOPS_MEMORY (on|off), AIOPS_ACT_GUARD (on|off),
#   RULES_RESTART (on = rules v2), LABEL (result label). Without LABEL: llm-v8.1 for the agent (since
#   2026-10-11: prompt v8 with corrected tool descriptions; the measured v8 runs are labelled llm-v8),
#   rules-v2 when RULES_RESTART=on, else the strategy name. Older agent versions
#   (and their labels llm, llm-v5 ... llm-v7) were removed on 2026-10-10: thesis_notes/removed_and_archived.md.
# Output: 4-load-testing/eval_[stuck_]<strategy>_<time>/ + one row in the results CSV
# The whole body is one { ... } block: bash parses it completely before running, so editing
# this file while it runs cannot break the running copy (an edit at 14:44 on 2026-10-03 did).
{
set -u
cd "$(dirname "$0")/.."
STRATEGY=$1
NOTES=${2:-}
SCENARIO=${SCENARIO:-baseline}
DEFAULT_LABEL=$STRATEGY
[ "$STRATEGY" = "llm" ] && DEFAULT_LABEL=llm-v8.1
[ "$STRATEGY" = "rules" ] && [ "$(echo "${RULES_RESTART:-off}" | tr '[:upper:]' '[:lower:]')" = "on" ] && DEFAULT_LABEL=rules-v2
LABEL=${LABEL:-$DEFAULT_LABEL}
# One k6 script per scenario (since 2026-10-11; until then baseline_eval.js and one fault_load.js for all
# three faults, with the same load as k6/stuck.js, k6/cpuhog.js and k6/badconfig.js).
case "$SCENARIO" in
  baseline) PREFIX=""; RESULTS=4-load-testing/evaluation_results.csv ;;
  stuck|cpuhog|badconfig) PREFIX="${SCENARIO}_"; RESULTS=4-load-testing/evaluation_results_${SCENARIO}.csv ;;
  *) echo "unknown SCENARIO $SCENARIO"; exit 1 ;;
esac
K6_SCRIPT=4-load-testing/k6/$SCENARIO.js
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
log "env: AIOPS_MEMORY=${AIOPS_MEMORY:-on} AIOPS_ACT_GUARD=${AIOPS_ACT_GUARD:-on} RULES_RESTART=${RULES_RESTART:-off} LABEL=$LABEL"
# Undo a bad-config change an earlier run may have left behind (no-op if absent).
if kubectl get $DEPLOY -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' | grep -qw FEATURE_LOGIN_AUDIT; then
  log "removing FEATURE_LOGIN_AUDIT left by an earlier run"
  kubectl set env $DEPLOY FEATURE_LOGIN_AUDIT- >/dev/null
fi
# Fresh pods for every run: a pod left stuck or hogged by an earlier run (by a strategy that never restarts)
# stays that way. Until 2026-10-22 00:55 only fault runs restarted, so the normal-load HPA run of
# campaign-2026-10-21 (21:48) inherited the cpuhog pod of the run before it (relabelled hpa-INVALID).
kubectl rollout restart $DEPLOY >/dev/null
kubectl scale $DEPLOY --replicas=$START_REPLICAS >/dev/null
kubectl rollout status $DEPLOY --timeout=180s >/dev/null
# Fresh rollout history for every run (added 2026-10-03 15:30, moved after the restart 15:45):
# prompt v6's get_deployment_history would otherwise show the changes and rollbacks of earlier runs,
# a hint that leaks across runs. revisionHistoryLimit 0 deletes the old ReplicaSets (back to 10 after).
# Done after the restart above, so the current ReplicaSet is a fresh one with no re-use history.
kubectl patch $DEPLOY -p '{"spec":{"revisionHistoryLimit":0}}' >/dev/null; sleep 5
kubectl patch $DEPLOY -p '{"spec":{"revisionHistoryLimit":10}}' >/dev/null
log "rollout history reset: $(kubectl get rs -l app=aiops-backend --no-headers 2>/dev/null | wc -l | tr -d ' ') ReplicaSet(s) left"
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
if [ "$SCENARIO" != "baseline" ]; then
  (
    sleep $FAULT_AFTER_SECONDS
    date "+%Y-%m-%d %H:%M:%S" > "$OUT/fault_at.txt"
    if [ "$SCENARIO" = "badconfig" ]; then
      echo "[$(date +%H:%M:%S)] inject badconfig: $(kubectl set env $DEPLOY FEATURE_LOGIN_AUDIT=true 2>&1)" >> "$OUT/experiment.log"
    else
      for pod in $(kubectl get pods -l app=aiops-backend --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}'); do
        echo "[$(date +%H:%M:%S)] inject $SCENARIO -> $pod: $(kubectl exec "$pod" -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/$SCENARIO 2>&1)" >> "$OUT/experiment.log"
      done
    fi
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
$PY 4-load-testing/evaluate_run.py --label "$LABEL" --run-dir "$OUT" --notes "$NOTES" \
  --results "$RESULTS" $FAULT_ARG | tee "$OUT/score.txt"
log "done"
exit
}
