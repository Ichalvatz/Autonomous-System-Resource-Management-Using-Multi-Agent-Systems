#!/bin/bash
# One comparable experiment (thesis phase 2, 2026-10-22): clean reset -> start ONE strategy -> the scenario's
# k6 script (4-load-testing/k6/<SCENARIO>.js: the request mix of k6/lib/mix.js at arrival rates derived from
# the NFR capacity table) -> stop the strategy -> score with evaluate_run.py at the ingress (as users see it).
#
# Usage (from repo root):  ./4-load-testing/run_experiment.sh <strategy> [notes]
#   llm       anomaly detector + LLM agent v9 (needs GEMINI_API_KEY, read from .env if unset)
#   hpa       Kubernetes HPA (4-load-testing/baselines/hpa.yaml, needs metrics-server): the native mechanism.
#             Both strategies run on the same deployment, with the same readiness and liveness probes, so the
#             comparison is "Kubernetes alone" vs "Kubernetes + agent".
#   (rules, rules-v2, static-1 and static-3 were the phase-1 baselines; removed 2026-10-22: git tag v8.1-campaign.)
#
# SCENARIO=baseline (default): normal traffic, 1 -> 2 -> 3 -> 2 -> 1 pods needed; scored by SLO violation,
#   errors, replica-minutes and % of time correctly provisioned (results_nfr.csv).
# SCENARIO=stuck: steady load in the 1-pod band; at t = 4 min every backend pod gets POST /chaos/stuck (every
#   request waits 3 s for a "leaked" DB connection, then 503; /ready fails, so the readiness probe takes the
#   pod out of service). New pods are healthy; only a restart fixes the old processes. results_nfr_stuck.csv.
# SCENARIO=cpuhog: same load and timing, POST /chaos/cpuhog (a never-ending job blocks the event loop 600 ms at
#   a time). Looks like overload; only a restart fixes it. results_nfr_cpuhog.csv.
# Env switches passed through to the controller: AIOPS_MEMORY (on|off), AIOPS_ACT_GUARD (on|off), LABEL (result
#   label; default llm-v11 for the agent, hpa for the HPA).
# Output: 4-load-testing/eval_[<scenario>_]<strategy>_<time>/ + one row in the results CSV
# The whole body is one { ... } block: bash parses it completely before running, so editing
# this file while it runs cannot break the running copy (an edit at 14:44 on 2026-10-03 did).
{
set -u
cd "$(dirname "$0")/.."
STRATEGY=$1
NOTES=${2:-}
SCENARIO=${SCENARIO:-baseline}
DEFAULT_LABEL=$STRATEGY
[ "$STRATEGY" = "llm" ] && DEFAULT_LABEL=llm-v11
LABEL=${LABEL:-$DEFAULT_LABEL}
# Phase 2 results go to new files: their metrics are measured at the ingress, not comparable with phase 1's
# evaluation_results*.csv (backend histogram, login-only closed-model load).
case "$SCENARIO" in
  baseline) PREFIX=""; RESULTS=4-load-testing/results_nfr.csv ;;
  stuck|cpuhog) PREFIX="${SCENARIO}_"; RESULTS=4-load-testing/results_nfr_${SCENARIO}.csv ;;
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
  kubectl delete hpa aiops-backend-hpa --ignore-not-found >/dev/null 2>&1
  sleep 3
  # Background jobs of a non-interactive shell ignore SIGINT, and on 2026-10-01 a
  # leftover detector kept scaling during the HPA run. Never start with a stray controller.
  if pgrep -f "3-ai-agent/anomaly_detector.py" >/dev/null; then
    log "WARNING: stray controller still running after SIGTERM, killing: $(pgrep -f '3-ai-agent/anomaly_detector.py' | tr '\n' ' ')"
    pkill -9 -f "3-ai-agent/anomaly_detector.py"
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
# Power source every 30 s (added 2026-10-23 after a run that was partly on battery): evaluate_run.py counts the
# battery time, and the campaign report flags such runs. The protocol requires AC power for every run.
( while kill -0 $$ 2>/dev/null; do
    echo "$(date +%H:%M:%S) $(pmset -g batt | head -1 | grep -q 'AC Power' && echo AC || echo BATTERY)"; sleep 30
  done ) >> "$OUT/power.log" 2>/dev/null &

stop_all_controllers
START_REPLICAS=1
log "scenario=$SCENARIO strategy=$STRATEGY: reset to $START_REPLICAS replica(s)"
log "env: AIOPS_MEMORY=${AIOPS_MEMORY:-on} AIOPS_ACT_GUARD=${AIOPS_ACT_GUARD:-on} LABEL=$LABEL"
# Fresh pods for every run: a pod left stuck or hogged by an earlier run (by a strategy that never restarts)
# stays that way. Until 2026-10-22 00:55 only fault runs restarted, so the normal-load HPA run of
# campaign-2026-10-21 (21:48) inherited the cpuhog pod of the run before it (relabelled hpa-INVALID).
kubectl rollout restart $DEPLOY >/dev/null
kubectl scale $DEPLOY --replicas=$START_REPLICAS >/dev/null
kubectl rollout status $DEPLOY --timeout=180s >/dev/null
# Fresh rollout history for every run (added 2026-10-03 15:30, moved after the restart 15:45):
# get_deployment_history would otherwise show the changes and restarts of earlier runs,
# a hint that leaks across runs. revisionHistoryLimit 0 deletes the old ReplicaSets (back to 10 after).
# Done after the restart above, so the current ReplicaSet is a fresh one with no re-use history.
kubectl patch $DEPLOY -p '{"spec":{"revisionHistoryLimit":0}}' >/dev/null; sleep 5
kubectl patch $DEPLOY -p '{"spec":{"revisionHistoryLimit":10}}' >/dev/null
log "rollout history reset: $(kubectl get rs -l app=aiops-backend --no-headers 2>/dev/null | wc -l | tr -d ' ') ReplicaSet(s) left"
# The k6 token pool is logged in here, before the idle wait, not in k6's setup(): 20 logins at once at the very
# start of the load put p95 at ~0.45 s in a nearly empty 1 m window and woke the agent for nothing (smoke run
# 2026-10-23 04:50). Same pool mechanism as the ML scripts (5-ml-training/k6_driver.py).
TOKENS="$PWD/5-ml-training/k6_tokens.json"
(cd 5-ml-training && ../$PY -c "import k6_driver; k6_driver.make_token_pool()") >> "$OUT/experiment.log" 2>&1 \
  && log "k6 token pool ready" || { log "could not log the token pool in"; exit 1; }
sleep 120   # past the detector's 90 s settle window, host idle

case "$STRATEGY" in
  llm)
    if [ -z "${GEMINI_API_KEY:-}" ]; then
      GEMINI_API_KEY=$(grep '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'"); export GEMINI_API_KEY
    fi
    PYTHONUNBUFFERED=1 $PY 3-ai-agent/anomaly_detector.py > "$OUT/controller.log" 2>&1 & CTRL_PID=$! ;;
  hpa)
    kubectl apply -f 4-load-testing/baselines/hpa.yaml | tee "$OUT/controller.log" ;;
  *) log "unknown strategy $STRATEGY"; exit 1 ;;
esac
sleep 5
[ -n "$CTRL_PID" ] && ! kill -0 "$CTRL_PID" 2>/dev/null && { log "controller died at start:"; tail -5 "$OUT/controller.log"; exit 1; }

date "+%Y-%m-%d %H:%M:%S" > "$OUT/window.txt"
if [ "$SCENARIO" != "baseline" ]; then
  (
    sleep $FAULT_AFTER_SECONDS
    date "+%Y-%m-%d %H:%M:%S" > "$OUT/fault_at.txt"
    for pod in $(kubectl get pods -l app=aiops-backend --field-selector=status.phase=Running -o jsonpath='{.items[*].metadata.name}'); do
      echo "[$(date +%H:%M:%S)] inject $SCENARIO -> $pod: $(kubectl exec "$pod" -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/$SCENARIO 2>&1)" >> "$OUT/experiment.log"
    done
  ) & INJECT_PID=$!
fi
log "k6 $(basename $K6_SCRIPT) started"
k6 run --summary-export "$OUT/k6_summary.json" -e TOKENS_FILE="$TOKENS" $K6_SCRIPT > "$OUT/k6.log" 2>&1
log "k6 finished (exit $?)"
date "+%Y-%m-%d %H:%M:%S" >> "$OUT/window.txt"
[ "$STRATEGY" = "hpa" ] && kubectl get hpa aiops-backend-hpa >> "$OUT/controller.log" 2>&1
# Native recoveries are part of the result: restarts done by the liveness probe, readiness changes.
kubectl get pods -l app=aiops-backend -o wide > "$OUT/pods_at_end.txt" 2>&1
kubectl get events --sort-by=.lastTimestamp 2>/dev/null | grep -E "aiops-backend|Unhealthy|Killing|Scaled" | tail -60 > "$OUT/events.txt"
cleanup; CTRL_PID=""

sleep 20  # let the last Prometheus samples land
FAULT_ARG=""; [ -f "$OUT/fault_at.txt" ] && FAULT_ARG="--fault-at $(cat "$OUT/fault_at.txt" | tr ' ' 'T')"
$PY 4-load-testing/evaluate_run.py --label "$LABEL" --run-dir "$OUT" --notes "$NOTES" \
  --results "$RESULTS" $FAULT_ARG | tee "$OUT/score.txt"
log "done"
exit
}
