#!/bin/bash
# One-off (2026-10-26 22:20): repeats, after campaign-2026-10-26 ends, the two runs that touched battery power
# (charger dropped out for 26 s at 18:50 and 43 s at 22:16; relabelled *-INVALID, see their INVALID.txt):
#   eval_cpuhog_hpa_20261026_1841 (hpa-INVALID)  and  eval_stuck_llm_20261026_2158 (llm-v10-INVALID),
# with the same TAG and protocol (AC power, llm_ready for the agent, memory off for faults), then regenerates
# comparison_nfr.md and the report. As archive/campaign_followup.sh did for campaign-2026-10-23.
# Run from the repo root:  ./4-load-testing/archive/campaign_followup_2026-10-26.sh
{
cd "$(dirname "$0")/../.." || exit 1
TAG=campaign-2026-10-26
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
log "follow-up queued until the campaign ends: cpuhog hpa and stuck llm (repeats of the runs that touched battery)"
CPID=$(pgrep -f "bash ./4-load-testing/full_campaign.sh $TAG" | head -1)
[ -n "$CPID" ] && while kill -0 "$CPID" 2>/dev/null; do sleep 60; done
sleep 180
caffeinate -dimsu -w $$ &

until on_ac; do sleep 60; done
log "start cpuhog hpa (follow-up)"
env SCENARIO=cpuhog ./4-load-testing/run_experiment.sh hpa "$TAG" >> "$LOG.runs" 2>&1
log "end   cpuhog hpa (follow-up, exit $?)"
sleep 180

until on_ac; do sleep 60; done
until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done
log "start stuck llm (memory off) (follow-up)"
env SCENARIO=stuck AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
log "end   stuck llm (follow-up, exit $?)"

$PY 4-load-testing/compare_results.py "$TAG" > 4-load-testing/compare_results_latest.log 2>&1 \
  && log "comparison_nfr.md and timelines regenerated" || log "compare_results.py failed"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" && log "report: 4-load-testing/${TAG}.md"
log "follow-up done"
exit
}
