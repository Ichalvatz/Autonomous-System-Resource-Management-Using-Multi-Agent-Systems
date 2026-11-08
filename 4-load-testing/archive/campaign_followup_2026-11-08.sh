#!/bin/bash
# One-off (2026-11-08 20:07): repeats, after campaign-v14-2026-11-08 ends, the run that touched battery power
# (18:58:56-19:15:26; relabelled llm-v14-INVALID, see its INVALID.txt): eval_llm_20261108_1822, the normal load with
# memory on, with the same TAG and protocol (AC power, llm_ready), then regenerates comparison_nfr.md and the report.
# As archive/campaign_followup_2026-10-26.sh did for campaign-2026-10-26. The memory then holds the incidents of the
# whole campaign, not only those of the runs before the excluded one (as in the follow-ups of 23/10 and 26/10).
# Run from the repo root:  nohup ./4-load-testing/archive/campaign_followup_2026-11-08.sh > /dev/null 2>&1 &
{
cd "$(dirname "$0")/../.." || exit 1
TAG=campaign-v14-2026-11-08
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
log "follow-up queued until the campaign ends: baseline llm (repeat of eval_llm_20261108_1822, battery)"
CPID=$(pgrep -f "full_campaign.sh $TAG" | head -1)
[ -n "$CPID" ] && while kill -0 "$CPID" 2>/dev/null; do sleep 60; done
sleep 180
caffeinate -dimsu -w $$ &

until on_ac; do sleep 60; done
until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done
log "start baseline llm (memory on) (follow-up)"
env SCENARIO=baseline AIOPS_MEMORY=on ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
log "end   baseline llm (follow-up, exit $?)"

$PY 4-load-testing/compare_results.py "$TAG" > 4-load-testing/compare_results_latest.log 2>&1 \
  && log "comparison_nfr.md and timelines regenerated" || log "compare_results.py failed"
$PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" && log "report: 4-load-testing/${TAG}.md"
log "follow-up done"
exit
}
