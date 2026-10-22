#!/bin/bash
# Full comparison campaign: the agent and every baseline on all four scenarios, under the same
# conditions, in one go (added 2026-10-21 to measure v8.1; reusable for any later version).
#
# Usage (from the repo root; laptop on AC power, lid open, only Docker + a terminal open):
#   ./4-load-testing/full_campaign.sh [TAG]        # TAG goes into the notes column (default campaign-<date>)
#   LLM_RUNS=3       agent runs per scenario (default 3)
#   MAX_WAIT_H=8     how long to wait for the LLM once only agent runs are left
# Stop:  pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh
#
# What runs (each one = run_experiment.sh: reset, strategy, k6, score):
#   agent (llm-v8.1)  LLM_RUNS x {stuck, cpuhog, badconfig, baseline}; fault runs AIOPS_MEMORY=off, normal-load
#                     runs memory on (the protocol of the measured v8 runs, archive/v8_queue.sh)
#   baselines         hpa, rules, rules-v2 on all four scenarios; static-1 and static-3 on the normal load
# Order: agent and baseline runs alternate, so every method is sampled across the whole night. An agent run
#   starts only when llm_ready.py gets 3 answers in a row from the primary model; until then baseline runs
#   go first, and once only agent runs are left it checks again every 5 min.
# Every run waits for AC power first: on battery macOS slows the CPU and the numbers are not comparable.
# At the end: compare_results.py (comparison.md + timelines) and campaign_report.py (campaign_<TAG>.md).
# Time: ~45 min per normal-load run, ~24 min per fault run: ~13 h with the defaults.
# The whole body is one { ... } block: bash parses it completely before running, so editing this file while
# it runs cannot break the running copy.
{
set -u
cd "$(dirname "$0")/.."
TAG=${1:-campaign-$(date +%Y-%m-%d)}
LLM_RUNS=${LLM_RUNS:-3}
MAX_WAIT_H=${MAX_WAIT_H:-8}
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

if pgrep -f "run_experiment.sh" >/dev/null; then
  echo "another experiment is running (run_experiment.sh): stop it first"; exit 1
fi
caffeinate -dimsu -w $$ &

# Provenance: the exact code, model, data and load this campaign measured.
log "campaign $TAG: LLM_RUNS=$LLM_RUNS MAX_WAIT_H=$MAX_WAIT_H"
log "git HEAD $(git rev-parse --short HEAD), uncommitted files: $(git status --porcelain | wc -l | tr -d ' ')"
shasum -a 256 3-ai-agent/agent.py 3-ai-agent/agent_tools.py 3-ai-agent/anomaly_detector.py \
  3-ai-agent/rule_scaler.py 5-ml-training/health_model.pkl 5-ml-training/capacity_table.json \
  4-load-testing/baselines/hpa.yaml 4-load-testing/k6/baseline.js 4-load-testing/k6/stuck.js \
  4-load-testing/k6/cpuhog.js 4-load-testing/k6/badconfig.js >> "$LOG"

on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
wait_for_ac(){
  on_ac && return
  log "on battery: waiting for AC power"
  until on_ac; do sleep 60; done
  log "AC power back"
}
llm_ready(){ $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; }

run(){  # run <scenario> <method>; method = llm | hpa | rules | rules-v2 | static-1 | static-3
  local scenario=$1 method=$2 strategy=$2 memory=""
  case $method in
    rules-v2) strategy=rules ;;
    llm) memory=on; [ "$scenario" != baseline ] && memory=off ;;
  esac
  wait_for_ac
  log "start $scenario $method${memory:+ (memory $memory)}"
  if [ "$method" = rules-v2 ]; then
    env SCENARIO="$scenario" RULES_RESTART=on ./4-load-testing/run_experiment.sh "$strategy" "$TAG" >> "$LOG.runs" 2>&1
  elif [ -n "$memory" ]; then
    env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh "$strategy" "$TAG" >> "$LOG.runs" 2>&1
  else
    env SCENARIO="$scenario" ./4-load-testing/run_experiment.sh "$strategy" "$TAG" >> "$LOG.runs" 2>&1
  fi
  log "end   $scenario $method (exit $?)"
  sleep 180   # host idle between runs
}

AGENT=()
for i in $(seq 1 "$LLM_RUNS"); do AGENT+=(stuck cpuhog badconfig baseline); done
BASE=(badconfig:rules-v2 stuck:hpa cpuhog:rules baseline:hpa
      stuck:rules-v2 cpuhog:hpa badconfig:rules baseline:rules
      cpuhog:rules-v2 badconfig:hpa stuck:rules baseline:rules-v2
      baseline:static-1 baseline:static-3)
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
  && log "comparison.md and timelines regenerated" || log "compare_results.py failed (see compare_results_latest.log)"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" \
  && log "report: 4-load-testing/${TAG}.md" || log "campaign_report.py failed"
log "campaign done"
exit
}
