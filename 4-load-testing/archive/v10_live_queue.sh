#!/bin/bash
# Agent v10, live steps before the campaign (2026-10-26, design_decisions.md A28): one-off queue.
#   1. wait for AC power; save the incident memory (v9's space) and empty it (v10 embeds in a new space);
#   2. live detector validation with the v10 model (detector_validation.sh, ~34 min, dry run, no agent);
#   3. smoke runs of the agent: stuck, cpuhog (memory off) and the normal load (memory on), notes smoke-v10-2026-10-26.
# Every step waits for AC power; an agent run also waits until llm_ready.py gets 3/3 answers. The campaign itself is
# started separately (full_campaign.sh) after the smoke results are checked.
# Run from the repo root:  ./4-load-testing/archive/v10_live_queue.sh   (log: 4-load-testing/v10_live_queue.log)
{
set -u
cd "$(dirname "$0")/../.."
LOG=4-load-testing/v10_live_queue.log
PY=.venv/bin/python3
TAG=smoke-v10-2026-10-26
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
wait_for_ac(){
  on_ac && return
  log "on battery: waiting for AC power"
  until on_ac; do sleep 60; done
  log "AC power"
  sleep 120   # let the CPU settle after the switch
}
caffeinate -dimsu -w $$ &

wait_for_ac
log "v10 live queue: git HEAD $(git rev-parse --short HEAD); model $(shasum -a 256 5-ml-training/health_model.pkl | cut -c1-12)"
$PY 3-ai-agent/memory_snapshot.py save 4-load-testing/archive/memory_snapshots/chroma_snapshot_2026-10-26_before_v10.json >> "$LOG" 2>&1
$PY reset_chroma.py >> "$LOG" 2>&1

wait_for_ac
log "detector validation (dry run, v10 model)"
( while kill -0 $$ 2>/dev/null; do
    echo "$(date +%H:%M:%S) $(pmset -g batt | head -1 | grep -q 'AC Power' && echo AC || echo BATTERY)"; sleep 30
  done ) > 4-load-testing/detector_validation_power.log 2>/dev/null &
POWER=$!
./4-load-testing/detector_validation.sh >> "$LOG" 2>&1
kill $POWER 2>/dev/null
$PY 4-load-testing/analyze_validation.py > 4-load-testing/detector_validation.out 2>&1
log "validation done: $(grep -c BATTERY 4-load-testing/detector_validation_power.log) battery samples"
sleep 180

for scenario in stuck cpuhog baseline; do
  memory=on; [ "$scenario" != baseline ] && memory=off
  wait_for_ac
  until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do log "primary model not answering: retry in 5 min"; sleep 300; done
  log "smoke $scenario llm (memory $memory)"
  env SCENARIO="$scenario" AIOPS_MEMORY="$memory" ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end smoke $scenario (exit $?)"
  sleep 180
done
log "v10 live queue done"
exit
}
