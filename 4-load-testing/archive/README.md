# Archive: one-off scripts and logs of past experiment sessions

Moved here on 2026-10-10 to declutter `4-load-testing/` (full list of what was removed or archived, and how to rerun an
old agent version: `thesis_notes/removed_and_archived.md`). Nothing here is needed to run the system or the
harness (`run_experiment.sh`, `queue.sh`, `evaluate_run.py`, `compare_results.py` stay one level up). They are
kept as **provenance**: the notes (`thesis_notes/history/phase1/early_notes/NOTES_2026-10-01_DAY.md`, `NOTES_2026-10-03.md`, `CLAUDE.md`) cite them to
show exactly how each measured run was launched (scenario, strategy, label, env switches, notes). The scored
results themselves live in `../evaluation_results*.csv` and `../eval_*/`.

The scripts `cd "$(dirname "$0")/.."` to reach the repo root, so they only run from `4-load-testing/`.
To re-run one, copy it back there first.

| File | What it was |
|---|---|
| `agent_experiment.sh` + `agent_experiment_{detector,k6}.log`, `agent_experiment_timeline.csv` | first full live run of detector + agent (2026-09-30), before the evaluation harness |
| `agent_live_run_2026-09-30_timeline.csv` | timeline of the first live run (the one where a Gemini 503 crashed the agent after scaling; led to code-side verification, decision A1) |
| `night_run.sh`, `night_20260930_2325/` | first overnight run, stopped after run 1 in favour of the comparison queue |
| `overnight_controller.sh`, `overnight_controller.log` | 2026-10-01 overnight plan: finish night run 1, then the strategy comparison queue |
| `followon_queue.sh` | re-ran HPA + LLM after the invalid 00:06 HPA run (`hpa-INVALID`) |
| `stuck_queue.sh`, `day_ablation.sh`, `day_followon.sh`, `day_followon2.sh` | 2026-10-01 day: stuck-fault comparison, memory-off ablation, extra v4 samples |
| `cpuhog_queue.sh` | blind cpuhog test with prompt v4 unchanged (2026-10-01 evening) |
| `v5_queue.sh` / `.out` | prompt v5 test (cpuhog ×2, stuck ×1, baseline ×1) |
| `mem_queue.sh` / `.out`, `mem_queue2.sh` / `.out` | memory experiment on cpuhog with v4; `mem_queue2` restores the same ChromaDB snapshot before every run (then `3-ai-agent/chroma_snapshot_*.json`, now `memory_snapshots/`) |
| `v6_queue.sh` / `.out`, `v6_queue2.sh`, `v6_queue3.sh` | prompt v6 + rules v2 + badconfig blind test; `v6_queue3` applied the evidence-before-action guard |
| `patches/` | the guard patch applied by `v6_queue3.sh` (now part of `3-ai-agent/agent_tools.py`, tested in `3-ai-agent/tests/test_final_agent.py`) |
| `v7_queue.sh` / `.out`, `v8_queue.sh` / `.out` | validation of prompts v7 and v8 and the remaining comparison runs |
| `q20261003_hpa.out` | output of a single HPA queue run (2026-10-03) |
| `memory_snapshots/` | ChromaDB exports (moved from `3-ai-agent/` on 2026-10-10): the backup of the 9 entries deleted after the invalid 00:06 HPA run, and the memory before/after the memory experiment (restored by `mem_queue2.sh` before every run) |
| `eval_hpa_20261003_1420_ABORTED/` | HPA run broken by editing `run_experiment.sh` while it ran (not scored; repeated) |
| `timelines_until_2026-10-04/` | copies (2026-10-21) of the four `comparison*_timelines.png` and `comparison.md` as of 2026-10-04, with every run up to then; Prometheus keeps only 10 days, so they cannot be redrawn (`thesis_notes/design_decisions.md` A22) |
| `timelines_campaign-2026-10-21/` | copies (2026-10-22) of the four `comparison*_timelines.png` drawn from the `series.json` of the campaign-2026-10-21 runs (every run since 2026-10-12 with data: the campaign only); source of `thesis_notes/figures/comparison_*_2026-10-21.png` (`make_comparison_panels.py`) |
| `a32_replay_follow/` | the comparison of A32 (2026-11-02): v12's detector (90 s skipped after a pod-count change) against v13's first version, on 1 m readings (`replay_follow.py` → `replay_v13_follow.md`); superseded by A32.1 and `../replay_v13.py` |
| `clean_window_readings.json` | readings of post-change data only (windows from 20 s to 1 min after a change), fetched from Prometheus by `../replay_model.py` (`clean_reading`) for the replays of v13 (A32.1); Prometheus keeps 10 days, so the replays rerun from here |
| `detector_validation_v12/` | the live detector validation of v12 (2026-11-01: phases, logs, `detector_validation.out`, series), moved on 2026-11-03 before v13's (`../../5-ml-training/v12/` has its dry-run readings) |
| `v13_live_queue.sh` | v13's live checks (2026-11-03): the detector validation and two smoke runs (normal load, stuck), after a 1 h delay and on AC power |
