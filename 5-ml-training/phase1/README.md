# Phase 1 ML pipeline (until 2026-10-22): kept as evidence

The scripts and data of the per-replica One-Class SVMs on CPU, throttling, p95 and throughput
(the backend's own metrics, login-only closed-model traffic). They produced every phase-1 result
(agent v3–v8.1, the campaign of 2026-10-21/22) and the figures in `thesis_notes/figures/`.

| File | What |
|---|---|
| `capacity_discovery.py`, `collect_healthy_data.py`, `train_health_baseline.py` | the phase-1 pipeline, unchanged copies (they read and write this folder) |
| `capacity_table.json`, `capacity_discovery_log.csv` | capacity 2026-09-28 (1–6 replicas in the log, table cut to 1–3) |
| `baseline_metrics_healthy.csv`, `*_filtered.csv` | healthy training data 2026-09-30 |
| `health_model.pkl` | the deployed per-replica bundle (gitignored) |
| `isolation_forest_baseline.pkl` | the last Isolation Forest, 2026-09-30 (gitignored) |

Phase 2 (NFR-driven, one OCSVM, ingress metrics, request mix): the scripts one level up;
see `thesis_notes/design_decisions.md` A24 and later.
