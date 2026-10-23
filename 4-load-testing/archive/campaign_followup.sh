#!/bin/bash
# One-off (2026-10-23 09:20): repeats, after campaign-2026-10-23 ends, the agent's normal-load run of 08:34 that
# was partly on battery (eval_llm_20261023_0834, relabelled llm-v9-INVALID), with the same TAG and protocol
# (AC power, llm_ready, memory on for the normal load), then regenerates comparison_nfr.md and the report.
cd "$(dirname "$0")/../.." || exit 1
TAG=campaign-2026-10-23
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
log "follow-up queued until the campaign ends: baseline llm (repeat of the 08:34 run, partly on battery)"
CPID=$(pgrep -f "bash ./4-load-testing/full_campaign.sh $TAG" | head -1)
[ -n "$CPID" ] && while kill -0 "$CPID" 2>/dev/null; do sleep 60; done
sleep 180
caffeinate -dimsu -w $$ &
until pmset -g batt | head -1 | grep -q "AC Power"; do sleep 60; done
until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done
log "start baseline llm (memory on) (follow-up)"
env SCENARIO=baseline AIOPS_MEMORY=on ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
log "end   baseline llm (follow-up, exit $?)"
$PY 4-load-testing/compare_results.py > 4-load-testing/compare_results_latest.log 2>&1 \
  && log "comparison_nfr.md and timelines regenerated" || log "compare_results.py failed"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" && log "report: 4-load-testing/${TAG}.md"
log "follow-up done"
