# Overnight report: 2026-09-30 → 2026-10-01

## Headline

On the same 40-minute demo load (`baseline.js`, 5→20→30→14→5 VUs):

| Strategy (runs) | SLO violation | Pressure | Replica-min | Correct prov. | Over-prov. |
|---|---|---|---|---|---|
| static-1 (1) | **550 s** | 1540 s | 38.2 | 39% | 0 s |
| static-3 (1) | 0 s | 0 s | 114.5 | 22% | 1740 s |
| HPA, CPU 70% (2) | 0 s | 260 ± 130 s | 79.5 ± 0.3 | 69% | 645 s |
| Rules (2) | 0 s | **120 ± 0 s** | 78.2 ± 0.1 | 77% | 515 s |
| **LLM agent v3 (3)** | **0 s** | 393 ± 45 s | **71.6 ± 0.2** | **86%** | **213 s** |

The LLM agent (v3):

- **never broke the user SLO** (0 s with p95 > 0.35 s, in every run),
- used **37% fewer replica-minutes than always running 3 pods**, **10% fewer than Kubernetes HPA** and **8% fewer than the rule-based scaler**,
- was **correctly provisioned 86% of the time** (HPA 69%, rules 77%), mostly because it releases pods promptly: 213 s over-provisioned vs 645 s (HPA, 300 s scale-down stabilization) and 515 s (rules, escalate to 3 pods during the 20-VU plateau),
- made **16/16 correct scaling decisions** across the four new-flow runs (v2 + 3×v3), every one verified STABLE by code and saved to memory,
- survived a real Gemini 503 in the middle of an incident (retried, completed),
- was very reproducible: replica-minutes 71.5 / 71.8 / 71.5.

Its weakness is reaction time: **~390 s of CPU/throttling pressure per run vs 120 s for the rules and ~260 s for HPA**
(the One-Class SVM needs 3 anomalous readings in a row over 1-minute rate windows, then the LLM call; ~100 s under-provisioned per run vs 0 for the rules).
That pressure never reached users (p95 stayed under the SLO in every run), so it is a cost/latency trade-off, not a failure. It is the clearest target for the next improvement.

Full table: `comparison.md`. Timelines: `comparison_timelines.png`. Raw: `evaluation_results.csv`, `../3-ai-agent/incident_log.csv`.

## What changed in the agent tonight

| Version | What | Evidence |
|---|---|---|
| v1 (before) | LLM did everything incl. verify + save; 5–6 LLM calls/incident; ChromaDB connected once at import | 22:28: Gemini 503 after the 2→3 scale crashed the run → never verified/saved; ChromaDB was down all run |
| v2 | **LLM decides+acts only**; code does memory lookup (into prompt), verification and save, also after an LLM crash. Retries 429/503 (5/15/30 s). ChromaDB lazy reconnect. Logs tool returns only WARN/ERROR/5xx. `add_base_tools=False`, `max_steps=6`. `incident_log.csv` | 4/4 STABLE + saved, 2 LLM calls and ~4 s per decision |
| v3 | **Metric-based memory** (same replica count, nearest by scaled metric distance; embeddings had put overload and waste at the same distance). **Verification waits for rollout + 45 s and checks the real SLO** (or ≥10% improvement). **Rollback** of a scale-down that fails verification | 12/12 STABLE over 3 runs; memory ranked the right incident first every time; one live 503 retried and completed |

Unit tests: `.venv/bin/python3 -m pytest 3-ai-agent/tests -q` → 29 passed (guards, verification verdicts, memory, rollback, rule decisions).

## New tooling

- `4-load-testing/run_experiment.sh <llm|rules|hpa|static-1|static-3>`: one clean, scored run.
- `4-load-testing/queue.sh ...`: back-to-back runs. `evaluate_run.py`: scoring. `compare_results.py`: table + plots.
- `3-ai-agent/rule_scaler.py`: rule baseline with the same information and gates as the agent.
- `4-load-testing/baselines/hpa.yaml` + metrics-server (installed; added to `deploy.sh`).

## Things that went wrong tonight (and what was done)

1. **First HPA run invalid.** The night-run detector survived `kill -INT`: background jobs of a non-interactive bash ignore SIGINT. From 00:31–00:44 the LLM agent scaled down 9 times and HPA's 300 s stabilization scaled back up each time. Row kept as `hpa-INVALID`, excluded from the comparison, re-run at 04:27 and 05:56. Scripts now use SIGTERM, and `run_experiment.sh` refuses to start with a stray controller alive.
   *Thesis point:* two controllers on one deployment fight; the agent must have exclusive control (or be HPA-aware).
2. **Duplicate queue for ~1 minute (00:04).** A leftover watcher started a second queue; killed before it applied load.
3. **Incident memory contains 9 entries from the invalid HPA run** (00:31–00:43, real states, verified by v2 code). They are not wrong, but if you want a memory built only from clean runs, wipe and rebuild (`reset_chroma.py`, then one LLM run).

## Applied after the last run (07:20; not in any of the measured runs)

- **Gemini sometimes returns an empty message** on the first step ("expected string or bytes-like object, got 'NoneType'"), costing one extra agent step and ~11 s (2/4 incidents in one run, 0/4 in the others). Now treated as a transient error and retried inside `RetryingLiteLLMModel` (unit-tested, 32/32 pass; not yet seen live).

## Open items
- **Reaction time.** Options to test: streak 2 instead of 3 for overload only, or 30 s rate windows. Each is a trade-off against false alarms; measure with `detector_validation.sh`.
- **Closed-loop load.** k6 VUs wait for responses, so an overloaded pod slows the load itself; static-1's 550 s of SLO violation understates real damage. Consider a `constant-arrival-rate` scenario for the final evaluation, or state it as a limitation.
- **Host load** still matters (2 pods at 20 VUs breached p95 ≈ 0.33 s in some runs). Keep the laptop idle during official runs.
