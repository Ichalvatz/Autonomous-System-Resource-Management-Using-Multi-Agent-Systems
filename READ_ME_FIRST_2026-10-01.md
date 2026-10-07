# What happened in the last 24 hours (2026-09-30 evening → 2026-10-01 evening)

One entry point. Read this page (10 min), then the documents in "Reading order" only where you want detail.

## The story in five steps

**1. Overnight (22:00 → 07:30): the evaluation harness and the first fair comparison.**
Built a reproducible experiment pipeline: one strategy at a time, same 40-min load (`baseline.js`), scored the
same way from Prometheus. Compared the LLM agent with Kubernetes HPA, a rule-based scaler (the agent's own 3 tiers
hard-coded, same information) and static 1 / 3 replicas. Also changed the agent's architecture: **the LLM only
decides and acts; code does the memory lookup, verification, rollback and saving** (a Gemini 503 had crashed a run
before anything was verified).
→ Result: on normal load every autoscaler kept the SLO; the agent was the **cheapest** (71.6 replica-min vs HPA 79.5,
rules 78.2, static-3 114.5) and the most accurately provisioned (86%), but reacted slowest to CPU pressure that users
did not notice.

**2. Morning (07:30 → 11:00): the "why an LLM?" experiment.**
On scaling, the LLM ≈ the rules. So a fault was added where **scaling is the wrong answer**: `/chaos/stuck`
(a leaked DB connection pool: every request waits 3 s, CPU drops, only a restart fixes it). HPA sees nothing
(CPU is low), rules scale to 3 and stay broken, **the agent reads the logs and restarts**.
Several real bugs were found and fixed on the way (verification judged a working restart as failed, memory matched
a stuck app to old overload incidents, etc.).

**3. Midday (11:00 → 14:40): prompt v4 and the RAG ablation.**
Prompt v3 scaled up instead of restarting in 1 of 3 runs (its rule said "latency high → scale up is MANDATORY").
Prompt v4: "find the bottleneck first; more pods only help when CPU is the bottleneck".
→ **v4: 4/4 first-try restarts, recovery 90–110 s; baselines never recover (0/5).** No regression on normal load.
Memory off: same result → **RAG had no measurable effect for this fault** (honest result for research question 2).

**4. Evening (18:00 → 19:50): the blind test, where v4 failed.**
v4 was written after seeing a failure, so it needed a fault it had never seen: `/chaos/cpuhog`, a runaway background
job that burns CPU (it looks like overload, but only a restart fixes it).
→ **Every strategy failed**, the LLM included (2/2 runs, identical behaviour: scale up, then "over-provisioned",
scale down, rolled back, three times). HPA did best for users simply because it didn't oscillate.
Why: the app's latency metric cannot see requests waiting behind a blocked event loop, so after scaling up the system
*looked* healthy. Two signals separate the fault cleanly: **CPU per request** (healthy 0.073 core-s, overload 0.066,
cpuhog 0.21–0.33) and **Node event-loop lag** (already scraped, never used).

**5. Night (19:50 → ~21:40, still running when this was written): prompt v5.**
v5 = v4 + one code-computed line: "CPU cost per request = N× the healthy value", with the rule "≈1× = real load,
≫1× = something else burns CPU → logs → restart".
→ **cpuhog with v5: 2/2 first-try restarts** (run 1: hog gone 110 s after the fault, users 6,664 logins at p95 0.23 s
≈ healthy; run 2 also read the logs, but had run 1's restart in memory, so it is not fully independent).
Regression checks done (21:32): v5 still restarts on the stuck fault (recovery 120 s) and scales correctly on normal
load (4/4 correct, 0 s SLO violation; 2 extra replica-minutes came from a Gemini outage, not from v5).

## Results at a glance

| Scenario | LLM agent | Best baseline | Evidence |
|---|---|---|---|
| Normal load (demo) | 0 s SLO violation, **cheapest** (71.6 replica-min) | rules 78.2, HPA 79.5 | p = 0.048 (exact, the minimum with 5 vs 2 runs) |
| Stuck dependency | **9/9 recovered** (v4: ~100 s) | 0/5 never | Fisher p = 0.0005 |
| Runaway job, v4 (blind) | 0/2: oscillated | 0/2 (HPA least harmful) | honest negative result |
| Runaway job, v4 + memory of the fix | **5/5 restarts** (vs 0/2 without); 3/3 in independent runs | – | RAG transfers knowledge; p = 0.10 (independent) |
| Runaway job, v5 | **2/2 restarts**, users ≈ healthy | – | designed AFTER seeing v4 fail: say so; no regression on stuck/demo |

## Things you must say honestly in the thesis
1. **Prompt iteration, not blind tests:** v4 was written after a v3 failure on the stuck fault; v5 after a v4 failure on
   cpuhog. The *blind* evidence is v4 on cpuhog (failed). v3/v4 results are kept in the CSVs with their labels.
2. **Small n** (1–5 runs per arm). Only exact tests were used. One more HPA and rules run on normal load would
   strengthen the cost claim.
3. **RAG: no benefit on the stuck fault, but it carried the fix on cpuhog** (v4: 0/2 → 2/2 with the fix in memory, 23:00); it also *repeated* a failed action 3× on cpuhog, because
   memory stores only successes.
4. **Host noise:** one cpuhog LLM run woke before the fault on a real latency blip (fresh pod), so its fault hit 2 pods.
5. The thesis angle that ties it together: **the LLM generalizes its reasoning (bottleneck → logs → restart), but only
   over the evidence it is shown. What the agent observes is part of the design.**

## Reading order (only as deep as you need)
1. **This page.**
2. `4-load-testing/comparison.md`: all tables + statistics (regenerated automatically when the v5 queue finishes).
   Figures: `comparison_timelines.png`, `comparison_stuck_timelines.png`, `comparison_cpuhog_timelines.png`.
3. `NOTES_2026-10-01_DAY.md`: the full log of the day. Top = summaries; bottom = "Evening session"
   (cpuhog + v5 details, the CPU-per-request and event-loop-lag numbers).
4. `4-load-testing/OVERNIGHT_REPORT_2026-10-01.md`: the overnight comparison and the agent v1→v3 architecture changes.
5. `THESIS_SUMMARY_EN.md` (bottom: "Status of the TODO items"): mapped to your thesis' research questions.
6. `CLAUDE.md`: the reference for *how* everything works (thresholds, design decisions and why). Don't read it top to
   bottom; look things up.

## Code that changed (if you review the diff)
- `3-ai-agent/agent.py`: prompt (v4 default, v5 opt-in via `AIOPS_PROMPT=v5`), verification/rollback/memory around the LLM.
- `3-ai-agent/agent_tools.py`: guarded tools, verification (latency must meet the SLO), metric-based memory.
- `2-target-app/software-backend/app.js`: `/chaos/stuck` and `/chaos/cpuhog`.
- `4-load-testing/run_experiment.sh`, `evaluate_run.py`, `compare_results.py`: harness, scoring, statistics.
- `3-ai-agent/tests/test_agent_logic.py`: 41 unit tests (`.venv/bin/python3 -m pytest 3-ai-agent/tests -q`).
Only the overnight + morning work is committed ("1 claude"); **everything from the evening is uncommitted.**

## Open decisions for you
1. Commit the evening work (`git status`).
2. Whether v5 becomes the default: the regression checks passed (n = 1 each), so it is reasonable; more runs would firm it up.
3. Next steps worth the time, in order: (a) 1–2 more HPA/rules runs on normal load (statistics);
   (b) "recent failed actions" in the prompt (memory gap); (c) event-loop lag as an agent signal or 6th model feature
   (needs retraining); (d) fix the rate-limiter hack + the 2 failing Jest tests (needs an image rebuild, not during runs).
