#!/bin/bash
# Full comparison campaign, phase 2 (2026-10-22): the agent (llm-v9) against the native Kubernetes HPA, both on
# the same deployment with the same probes, on the three scenarios, under the same conditions, in one go.
# (Phase 1's version, 2026-10-21: agent v8.1 against hpa, rules, rules-v2, static-1/3 on four scenarios; git tag
# v8.1-campaign.)
#
# Usage (from the repo root; laptop on AC power, lid open, only Docker + a terminal open):
#   ./4-load-testing/full_campaign.sh [TAG]        # TAG goes into the notes column (default campaign-<date>)
#   NORMAL_RUNS=4    runs per method on the normal load (default 4: one-sided exact permutation p >= 1/70)
#   FAULT_RUNS=4     runs per method and fault (default 4)
#   MAX_WAIT_H=8     how long to wait for the LLM once only agent runs are left
# Stop:  pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh
#
# Protocol: agent fault runs with AIOPS_MEMORY=off (diagnosis without hints), normal-load runs with memory on,
# as in phase 1. The incident memory (ChromaDB collection incidents_nfr) is emptied at the start, so nothing
# from the smoke runs leaks in. Agent and HPA runs alternate, so both are sampled across the whole night; an
# agent run starts only when llm_ready.py gets 3 answers in a row from the primary model.
# Every run waits for AC power first: on battery macOS slows the CPU and the numbers are not comparable.
# At the end: compare_results.py (comparison_nfr.md + timelines) and campaign_report.py (<TAG>.md).
# Time: ~46 min per normal-load run, ~27 min per fault run: ~13 h with the defaults.
# The whole body is one { ... } block: bash parses it completely before running, so editing this file while
# it runs cannot break the running copy.
{
set -u
cd "$(dirname "$0")/.."
TAG=${1:-campaign-$(date +%Y-%m-%d)}
NORMAL_RUNS=${NORMAL_RUNS:-4}
FAULT_RUNS=${FAULT_RUNS:-4}
MAX_WAIT_H=${MAX_WAIT_H:-8}
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

if pgrep -f "run_experiment.sh" >/dev/null; then
  echo "another experiment is running (run_experiment.sh): stop it first"; exit 1
fi
caffeinate -dimsu -w $$ &

# Provenance: the exact code, model, data and load this campaign measured.
log "campaign $TAG: NORMAL_RUNS=$NORMAL_RUNS FAULT_RUNS=$FAULT_RUNS MAX_WAIT_H=$MAX_WAIT_H"
log "git HEAD $(git rev-parse --short HEAD), uncommitted files: $(git status --porcelain | wc -l | tr -d ' ')"
log "backend image $(kubectl get pods -l app=aiops-backend -o jsonpath='{.items[0].status.containerStatuses[0].imageID}')"
shasum -a 256 3-ai-agent/agent.py 3-ai-agent/agent_tools.py 3-ai-agent/anomaly_detector.py 3-ai-agent/health_model.py \
  3-ai-agent/nfr_metrics.py 5-ml-training/health_model.pkl 5-ml-training/capacity_table.json \
  4-load-testing/baselines/hpa.yaml 2-target-app/backend-deployment.yaml 4-load-testing/k6/lib/mix.js \
  4-load-testing/k6/baseline.js 4-load-testing/k6/stuck.js 4-load-testing/k6/cpuhog.js >> "$LOG"
$PY - >> "$LOG" 2>&1 <<'PYEOF'
import chromadb
c = chromadb.HttpClient(host="chromadb.aiops", port=80)
names = [x.name for x in c.list_collections()]
if "incidents_nfr" in names:
    print(f"incident memory emptied ({c.get_collection('incidents_nfr').count()} incidents from before the campaign)")
    c.delete_collection("incidents_nfr")
else:
    print("incident memory: empty at the start")
PYEOF

on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
wait_for_ac(){
  on_ac && return
  log "on battery: waiting for AC power"
  until on_ac; do sleep 60; done
  log "AC power back"
}
llm_ready(){ $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; }

run(){  # run <scenario> <method>; method = llm | hpa
  local scenario=$1 method=$2 memory=""
  [ "$method" = llm ] && { memory=on; [ "$scenario" != baseline ] && memory=off; }
  wait_for_ac
  log "start $scenario $method${memory:+ (memory $memory)}"
  if [ -n "$memory" ]; then
    env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh "$method" "$TAG" >> "$LOG.runs" 2>&1
  else
    env SCENARIO="$scenario" ./4-load-testing/run_experiment.sh "$method" "$TAG" >> "$LOG.runs" 2>&1
  fi
  log "end   $scenario $method (exit $?)"
  sleep 180   # host idle between runs
}

# The same sequence of scenarios for both methods: normal load and the two faults interleaved.
SEQ=()
for i in $(seq 1 "$(( NORMAL_RUNS > FAULT_RUNS ? NORMAL_RUNS : FAULT_RUNS ))"); do
  [ "$i" -le "$FAULT_RUNS" ] && SEQ+=(stuck cpuhog)
  [ "$i" -le "$NORMAL_RUNS" ] && SEQ+=(baseline)
done
AGENT=("${SEQ[@]}")
BASE=()
for scenario in "${SEQ[@]}"; do BASE+=("$scenario:hpa"); done
ai=0; bi=0; waited=0; prefer=llm
while [ $ai -lt ${#AGENT[@]} ] || [ $bi -lt ${#BASE[@]} ]; do
  if [ $prefer = llm ] && [ $ai -lt ${#AGENT[@]} ] && llm_ready; then
    run "${AGENT[$ai]}" llm; ai=$((ai + 1)); prefer=base; waited=0
  elif [ $bi -lt ${#BASE[@]} ]; then
    run "${BASE[$bi]%%:*}" "${BASE[$bi]#*:}"; bi=$((bi + 1)); prefer=llm
  elif [ $ai -lt ${#AGENT[@]} ] && llm_ready; then
    run "${AGENT[$ai]}" llm; ai=$((ai + 1)); waited=0
  elif [ $waited -ge $((MAX_WAIT_H * 3600)) ]; then
    log "primary model still unavailable after $MAX_WAIT_H h: $((${#AGENT[@]} - ai)) agent runs not done"
    break
  else
    log "only agent runs left and the primary model is unavailable: checking again in 5 min"
    sleep 300; waited=$((waited + 300))
  fi
done

log "all runs done: $ai/${#AGENT[@]} agent, $bi/${#BASE[@]} baseline"
$PY 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1 \
  && log "comparison_nfr.md and timelines regenerated" || log "compare_results.py failed (see compare_results_latest.log)"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" \
  && log "report: 4-load-testing/${TAG}.md" || log "campaign_report.py failed"
log "campaign done"
exit
}
