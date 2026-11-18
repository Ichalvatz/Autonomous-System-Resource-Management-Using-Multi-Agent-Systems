#!/bin/bash
# One-off (2026-11-18, the user: «τρέξε το τελευταίο τεστ, εκείνο που θέλει 3 ώρες»): the two optional experiments left
# open by the audit of 2026-11-10 (design_decisions.md "Α34: έλεγχος μετά την καμπάνια"), agent v14 unchanged.
#  1. cpuhog with a neutral log line: 2 x SCENARIO=cpuhog, memory off as in the campaign. The job's line no longer says
#     "event loop blocked 600ms per iteration" (app.js, 2026-11-18), which the agent copied into 2 of its 4 cpuhog root
#     causes. Question: does it still restart, at the first wake-up, and what cause does it write?
#     Rows labelled llm-v14-neutrallog, notes cpuhog-neutral-log-2026-11-18, report cpuhog-neutral-log-2026-11-18.md.
#  2. then archive/memory_tests_2026-11-09.sh (memory on: stuck x2; normal load + cpuhog at 6:00 of k6 x2).
# Calls: 2 x (3 llm_ready + ~4 agent) = ~14, plus ~44 = ~58 of the primary's 500 a day. ~3 h. Waits for AC power.
# Run from the repo root:
#   nohup ./4-load-testing/archive/experiments_2026-11-18.sh > /dev/null 2>&1 &
{
cd "$(dirname "$0")/../.." || exit 1
TAG=cpuhog-neutral-log-2026-11-18
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
caffeinate -dimsu -w $$ &

ready(){ until on_ac; do sleep 60; done; until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done; }

log "calls today before the experiments: $($PY 4-load-testing/llm_ready.py --calls-today)"
for i in 1 2; do
  ready
  log "start cpuhog llm (neutral log line, memory off) #$i"
  env SCENARIO=cpuhog LABEL=llm-v14-neutrallog AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end   cpuhog llm #$i (exit $?)"
done
AGENT_LABEL=llm-v14-neutrallog $PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" \
  && log "report: 4-load-testing/${TAG}.md"

log "memory tests next"
./4-load-testing/archive/memory_tests_2026-11-09.sh
log "calls today after the experiments: $($PY 4-load-testing/llm_ready.py --calls-today)"
log "all done"
exit
}
