#!/bin/bash
# Agent v14: its campaign, in one command (A33, A34).
# Gemini's free tier allows 500 requests a day for the primary model (reset at midnight Pacific time, 10:00 in
# Greece); the campaign needs ~200 (campaign-2026-11-01: 140 in the agent runs, plus llm_ready).
#   1. if today's requests so far (the agent's, incident_log.csv) + 300 > 480: wait for the daily reset.
#   2. the campaign (full_campaign.sh campaign-v14-<date>, ~12-13 h), with its reports at the end;
#   3. its first round is the smoke test: once the first agent run of each scenario is done, smoke_gate.py --first
#      judges them (every action STABLE, no agent crash, the faults recovered by a restart, no battery) and a FAIL
#      stops the campaign.
# (Until 2026-11-08 separate smoke runs came first, ~1.3 h, and before them the rest of the prompt evaluation: A34
# closed the evaluation, and the user wanted the data the same day, so the campaign's first round does the smoke
# runs' job, as declared in A34 before the start.)
# Keep the laptop on AC power with only Docker and the terminal open.
# Run from the repo root:  nohup ./4-load-testing/v14_finish.sh > /dev/null 2>&1 &     (log: 4-load-testing/v14_finish.log)
# Stop:  pkill -f v14_finish.sh; pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh
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
  log "1. the agent used ~$used of today's 500 requests: enough left for the campaign"
fi

TAG="campaign-v14-$(date +%Y-%m-%d)"
log "2. campaign $TAG, ~12-13 h (progress: 4-load-testing/$TAG.log)"
./4-load-testing/full_campaign.sh "$TAG" &
CAMPAIGN=$!

log "3. the first round as the smoke test: waiting for the first agent run of each scenario"
while kill -0 $CAMPAIGN 2>/dev/null; do
  AGENT_LABEL=llm-v14 $PY 4-load-testing/smoke_gate.py --first "$TAG" > 4-load-testing/v14_first_round_gate.txt 2>&1
  rc=$?
  [ $rc -ne 2 ] && break
  sleep 300
done
cat 4-load-testing/v14_first_round_gate.txt >> "$LOG"
if [ "${rc:-2}" -eq 1 ]; then
  log "first-round gate FAIL (above): stopping the campaign"
  pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh
  exit 1
fi
[ "${rc:-2}" -eq 0 ] && log "first-round gate pass: the campaign goes on"
wait $CAMPAIGN
log "v14 finish done: 4-load-testing/$TAG.md, 4-load-testing/comparison_nfr.md"
exit
}
