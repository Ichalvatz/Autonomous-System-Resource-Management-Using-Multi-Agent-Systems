#!/bin/bash
# One-off (2026-11-09): how useful is the incident memory of agent v14 (the measured code, nothing changed)?
# Each test runs twice with memory on, "first time" vs "second time", so the second run can retrieve the first:
#   1-2. stuck (k6/stuck.js, fault at 4:00), as in the campaign but memory on (the campaign ran faults with memory off);
#   3-4. a fault during a ramp: the normal load (k6/baseline.js) with cpuhog injected at 6:00 of k6 (~63 rps rising).
#        Expected: the facts' trend says "minimum 2", so the agent scales 1->2 without investigating; the hogged pod
#        keeps p95 high, the verification says UNSTABLE and re-wakes it; then "Your recent actions" (15 min) show the
#        failed scale, the minimum equals the current count, and it should investigate and restart.
#        The failed scale is saved as "failed", which the lookup never returns (A15), so the 2nd run can retrieve
#        only the 1st run's restart, not avoid its first scale.
# Calls: ~44 Gemini requests (4 x llm_ready 3; stuck 4 each; ramp+cpuhog ~12 each). ~2 h 15 min.
# Written 2026-11-09, first run 2026-11-18 by archive/experiments_2026-11-18.sh, after the cpuhog job's log line lost
# its "event loop blocked 600ms per iteration" (app.js), so tests 3-4 see the neutral line.
# Results: eval_* dirs, rows labelled llm-v14-memtest with notes memory-tests-2026-11-18 (not part of any campaign),
# report memory-tests-2026-11-18.md. Run from the repo root:
#   nohup ./4-load-testing/archive/memory_tests_2026-11-09.sh > /dev/null 2>&1 &
{
cd "$(dirname "$0")/../.." || exit 1
TAG=memory-tests-2026-11-18
LOG=4-load-testing/${TAG}.log
PY=.venv/bin/python3
log(){ echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
on_ac(){ pmset -g batt | head -1 | grep -q "AC Power"; }
caffeinate -dimsu -w $$ &
export LABEL=llm-v14-memtest AIOPS_MEMORY=on

ready(){ until on_ac; do sleep 60; done; until $PY 4-load-testing/llm_ready.py >> "$LOG" 2>&1; do sleep 300; done; }

for i in 1 2; do
  ready
  log "start stuck llm (memory on) #$i"
  env SCENARIO=stuck ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1
  log "end   stuck llm #$i (exit $?)"
done

for i in 1 2; do
  ready
  log "start baseline llm + cpuhog at 6:00 of k6 (memory on) #$i"
  env SCENARIO=baseline ./4-load-testing/run_experiment.sh llm "$TAG" >> "$LOG.runs" 2>&1 &
  RUN=$!
  sleep 30
  OUT=$(ls -dt 4-load-testing/eval_llm_* | head -1)
  until grep -q "k6 baseline.js started" "$OUT/experiment.log" 2>/dev/null || ! kill -0 $RUN 2>/dev/null; do sleep 2; done
  sleep 360
  date "+%Y-%m-%d %H:%M:%S" > "$OUT/fault_at.txt"
  ./4-load-testing/inject.sh cpuhog >> "$OUT/experiment.log" 2>&1
  log "cpuhog injected into $OUT"
  wait $RUN
  log "end   baseline llm + cpuhog #$i (exit $?)"
done

AGENT_LABEL=llm-v14-memtest $PY 4-load-testing/campaign_report.py "$TAG" > "4-load-testing/${TAG}.md" 2>> "$LOG" \
  && log "report: 4-load-testing/${TAG}.md"
log "memory tests done"
exit
}
