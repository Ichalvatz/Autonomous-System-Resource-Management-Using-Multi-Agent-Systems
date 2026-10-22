#!/bin/bash
# Extra runs of a campaign after full_campaign.sh has finished, with the same TAG, then regenerates
# comparison.md and the campaign report.
# - 2026-10-22 00:55: the normal-load HPA run of campaign-2026-10-21 (21:48) inherited the cpuhog pod of the run
#   before it (run_experiment.sh restarted pods only for fault runs; fixed the same minute), so it was relabelled
#   hpa-INVALID and is repeated here.
# - 2026-10-22 09:40: method llm (the campaign's protocol: memory on for the normal load, off for faults; starts only
#   when llm_ready.py gets 3 answers from the primary model, waits up to MAX_WAIT_H). Used to add one primary-only
#   run per agent run in which the fallback model took decisions (rule set before the third round ended); the
#   fallback runs stay in the results.
# - 2026-10-22 14:30: an llm item waits for AC power before llm_ready, not after (the 11:18 answer was followed by
#   hours on battery, and the run would then have started on a stale check).
# AFTER_PID=<pid> also waits for that process (an earlier rerun still running): never two strategies at once.
#
#   nohup ./4-load-testing/campaign_rerun.sh campaign-2026-10-21 baseline:hpa > /dev/null 2>&1 &
#   AFTER_PID=65681 nohup ./4-load-testing/campaign_rerun.sh campaign-2026-10-21 stuck:llm baseline:llm > /dev/null 2>&1 &
cd "$(dirname "$0")/.." || exit 1
TAG=$1; shift
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
MAX_WAIT_H=${MAX_WAIT_H:-8}
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
llm_ready(){ $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; }

log "rerun queued until full_campaign.sh${AFTER_PID:+ and PID $AFTER_PID} end: $*"
# by PID: "pgrep -f full_campaign.sh" also matches any shell whose command line contains that name
CPID=$(pgrep -f "bash ./4-load-testing/full_campaign.sh" | head -1)
for pid in $CPID $AFTER_PID; do
  while kill -0 "$pid" 2>/dev/null; do sleep 60; done
done
sleep 180   # host idle after the last run
caffeinate -dimsu -w $$ &
for item in "$@"; do
  scenario=${item%%:*}; method=${item#*:}; strategy=$method; extra=()
  [ "$method" = rules-v2 ] && { strategy=rules; extra=(RULES_RESTART=on); }
  if [ "$method" = llm ]; then
    memory=on; [ "$scenario" != baseline ] && memory=off; extra=(AIOPS_MEMORY=$memory)
    until on_ac; do sleep 60; done   # power first: the model check must be fresh when the run starts
    waited=0
    until llm_ready; do
      [ $waited -ge $((MAX_WAIT_H * 3600)) ] && { log "primary model still unavailable after $MAX_WAIT_H h: $scenario llm not run"; continue 2; }
      sleep 300; waited=$((waited + 300))
    done
  fi
  until on_ac; do sleep 60; done
  log "start $scenario $method${memory:+ (memory $memory)} (rerun)"
  env SCENARIO="$scenario" "${extra[@]}" ./4-load-testing/run_experiment.sh "$strategy" "$TAG" >> "$LOG.runs" 2>&1
  log "end   $scenario $method (rerun, exit $?)"
  memory=""
  sleep 180
done
$PY 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1 \
  && log "comparison.md and timelines regenerated" || log "compare_results.py failed (see compare_results_latest.log)"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" \
  && log "report: 4-load-testing/${TAG}.md" || log "campaign_report.py failed"
