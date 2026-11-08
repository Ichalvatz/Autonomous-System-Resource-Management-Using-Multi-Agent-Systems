#!/bin/bash
# Agent v14: its live runs up to and including its campaign, in one command (A33, A34; started by the user by hand).
# Gemini's free tier allows 500 requests a day for the primary model (reset at midnight Pacific time, 10:00 in
# Greece); the smoke runs and the campaign need ~250 (campaign-2026-11-01: 140 in the agent runs, plus llm_ready).
#   1. if today's requests so far (the agent's, incident_log.csv) + 300 > 480: wait for the daily reset.
#   2. the smoke runs (archive/v14_live_queue.sh, ~1.5 h) and their gate (smoke_gate.py): stop if one went wrong.
#   3. the campaign (full_campaign.sh campaign-v14-<date>, ~13 h), with its reports at the end.
# (Until 2026-11-08 the rest of the prompt evaluation and its lag check came first; A34 closed the evaluation when the
# investigation tools changed.)
# Keep the laptop on AC power with only Docker and the terminal open.
# Run from the repo root:  nohup ./4-load-testing/v14_finish.sh > /dev/null 2>&1 &     (log: 4-load-testing/v14_finish.log)
# Stop:  pkill -f v14_finish.sh; pkill -f v14_live_queue.sh; pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh
{
set -u
cd "$(dirname "$0")/.."
LOG=4-load-testing/v14_finish.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
caffeinate -dimsu -w $$ &

log "v14 finish: git HEAD $(git rev-parse --short HEAD); power: $(pmset -g batt | head -1)"
used=$($PY 4-load-testing/llm_ready.py --calls-today 2>/dev/null || echo 500)
if [ $((used + 300)) -gt 480 ]; then
  secs=$($PY 4-load-testing/llm_ready.py --seconds-to-reset)
  log "1. the agent used ~$used of today's 500 requests: waiting $((secs / 60)) min for the daily reset"
  sleep "$secs"
else
  log "1. the agent used ~$used of today's 500 requests: enough left for the smoke runs and the campaign"
fi

DAY=$(date +%Y-%m-%d)
log "2. smoke runs smoke-v14-$DAY (progress: 4-load-testing/v14_live_queue.log)"
./4-load-testing/archive/v14_live_queue.sh "smoke-v14-$DAY"
if ! AGENT_LABEL=llm-v14 $PY 4-load-testing/smoke_gate.py "smoke-v14-$DAY" >> "$LOG" 2>&1; then
  log "smoke gate FAIL (above): stop before the campaign"; exit 1
fi
log "smoke gate pass"

log "3. campaign campaign-v14-$DAY, ~13 h (progress: 4-load-testing/campaign-v14-$DAY.log)"
./4-load-testing/full_campaign.sh "campaign-v14-$DAY"
log "v14 finish done: 4-load-testing/campaign-v14-$DAY.md, 4-load-testing/comparison_nfr.md"
exit
}
