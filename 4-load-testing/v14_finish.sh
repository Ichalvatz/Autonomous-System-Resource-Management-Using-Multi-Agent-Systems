#!/bin/bash
# Agent v14: everything left up to and including its campaign, in one command (A33; prepared 2026-11-05, started by
# the user by hand). Gemini's free tier allows 500 requests a day for the primary model (reset at midnight Pacific
# time, 10:00 in Greece), so the steps wait for the quota where needed:
#   1. the rest of the prompt evaluation (prompt_eval.py: v14 up to 3 runs on the 17 investigation cases, then the
#      lag check v14-lag on the same cases; ~380 requests). Resumable; it waits by itself for the quota and the provider.
#   2. its report (prompt_eval.md) and the lag gate: if the lag reference in get_pod_breakdown made the decisions
#      worse, stop before the live runs (A33: the reference is then removed).
#   3. the smoke runs and the campaign need ~250 requests (campaign-2026-11-01: 140 in the agent runs, plus llm_ready):
#      if the evaluation used too much of today's quota (its calls since the reset + 300 > 480), wait for the reset.
#   4. the smoke runs (archive/v14_live_queue.sh, ~1.5 h) and their gate (smoke_gate.py): stop if one went wrong.
#   5. the campaign (full_campaign.sh campaign-v14-<date>, ~13 h), with its reports at the end.
# Keep the laptop on AC power with only Docker and the terminal open.
# Run from the repo root:  nohup ./4-load-testing/v14_finish.sh > /dev/null 2>&1 &     (log: 4-load-testing/v14_finish.log)
# Stop:  pkill -f v14_finish.sh; pkill -f prompt_eval.py; pkill -f v14_live_queue.sh; pkill -f full_campaign.sh;
#        pkill -TERM -f run_experiment.sh
{
set -u
cd "$(dirname "$0")/.."
LOG=4-load-testing/v14_finish.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
caffeinate -dimsu -w $$ &

log "v14 finish: git HEAD $(git rev-parse --short HEAD); power: $(pmset -g batt | head -1)"
log "1. prompt evaluation, the rest of it (progress: 4-load-testing/prompt_eval.log)"
if ! $PY 4-load-testing/prompt_eval.py --reps 3 >> 4-load-testing/prompt_eval.log 2>&1; then
  log "prompt_eval.py failed (see prompt_eval.log): stop"; exit 1
fi
$PY 4-load-testing/prompt_eval.py --report > 4-load-testing/prompt_eval.md 2>> "$LOG"
log "2. report: 4-load-testing/prompt_eval.md"
if ! $PY 4-load-testing/prompt_eval.py --gate >> "$LOG" 2>&1; then
  log "the lag check did not pass (prompt_eval.md): stop before the live runs (A33: the lag reference is removed)"
  exit 1
fi

used=$($PY 4-load-testing/prompt_eval.py --calls-since-reset 2>/dev/null || echo 500)
if [ $((used + 300)) -gt 480 ]; then
  secs=$($PY -c "from datetime import datetime, timedelta; from zoneinfo import ZoneInfo
p = datetime.now(ZoneInfo('America/Los_Angeles'))
print(int(((p + timedelta(days=1)).replace(hour=0, minute=5, second=0, microsecond=0) - p).total_seconds()))")
  log "3. the evaluation used ~$used of today's 500 requests: waiting $((secs / 60)) min for the daily reset"
  sleep "$secs"
else
  log "3. the evaluation used ~$used of today's 500 requests: enough left for the smoke runs and the campaign"
fi

DAY=$(date +%Y-%m-%d)
log "4. smoke runs smoke-v14-$DAY (progress: 4-load-testing/v14_live_queue.log)"
./4-load-testing/archive/v14_live_queue.sh "smoke-v14-$DAY"
if ! AGENT_LABEL=llm-v14 $PY 4-load-testing/smoke_gate.py "smoke-v14-$DAY" >> "$LOG" 2>&1; then
  log "smoke gate FAIL (above): stop before the campaign"; exit 1
fi
log "smoke gate pass"

log "5. campaign campaign-v14-$DAY, ~13 h (progress: 4-load-testing/campaign-v14-$DAY.log)"
./4-load-testing/full_campaign.sh "campaign-v14-$DAY"
log "v14 finish done: 4-load-testing/campaign-v14-$DAY.md, 4-load-testing/comparison_nfr.md"
exit
}
