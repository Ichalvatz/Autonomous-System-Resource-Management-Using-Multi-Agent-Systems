# Agent v13's detector and verification against v12's (A32, A32.1)

*`replay_v13.py`, 2026-11-02 22:37. Model OneClassSVM-NFR-v11 trained 2026-11-01T15:45:55: gamma 0.1. Detector: 3 anomalous readings in a row, 60 s cooldown. Post-change readings from +20 s; still anomalous after 240 s -> UNSTABLE. Noise of a comparison (window_noise.json, 345 sequences of 27 HPA runs): 10 s apart +30 s 0.38, +40 s 0.22, +50 s 0.14, +60 s 0.10, +70 s 0.15, +80 s 0.12, +90 s 0.12, +100 s 0.15, +110 s 0.13, +120 s 0.13; 30 s apart +50 s 0.47, +60 s 0.30, +70 s 0.25, +80 s 0.25, +90 s 0.22, +100 s 0.22, +110 s 0.25, +120 s 0.25.*

## 1. The verification of every action in phase 2

117 actions with post-change readings (25 without: Prometheus keeps 10 days).

| Recorded (the rule of its time) | v13 (post-change readings) | Actions |
|---|---|---|
| STABLE | STABLE | 113 |
| UNSTABLE | UNSTABLE | 3 |
| UNSTABLE | STABLE | 1 |

STABLE in both: seconds after the rollout, recorded: 0 s: 28, 10 s: 22, 20 s: 9, 30 s: 6, 40 s: 5, 50 s: 9, 60 s: 30, 70 s: 4; v13: 20 s: 104, 30 s: 2, 40 s: 1, 50 s: 1, 60 s: 1, 70 s: 4.

Every other action:

| Run | Action | Recorded | v13 |
|---|---|---|---|
| eval_llm_20261101_1754 | ['scale 1->2'] | UNSTABLE: not improving at 40 s | STABLE at 20 s |
| unstable_test_2026-11-01 | ['restart'] | UNSTABLE: worse at 30 s | UNSTABLE: worse (score -11.02 -> -44.40 in 10 s) at 30 s |
| unstable_test_2026-11-01 | ['scale 1->3'] | UNSTABLE: worse at 60 s | UNSTABLE: worse (score -10.97 -> -14.61 in 10 s) at 30 s |
| unstable_test_2026-11-01 | ['restart'] | UNSTABLE: not improving at 40 s | UNSTABLE: not improving (score -10.63 -> -10.67 over the last 30 s) at 50 s |

With the rollout taken 3 s later, the same verdict for 117/117.

## 2. The detector after every action the verification called STABLE

137 STABLE actions with a series after them; 113 with post-change readings (76 changed the pod count). Wake-ups in the 150 s after the agent returned:

| Run | Action | v12 | v13 | Worst 1 m reading (series) |
|---|---|---|---|---|
| eval_llm_20261028_0924 | ['scale 2->3'] | none | +65 s | p95 0.37 s at 194 rps (3 pods) |

## 3. Changes nobody verified: the live detector validations A-I (the script scales by hand)

Wake-ups in seconds after the phase start; * = the streak started within 30 s of it (the previous phase).

### 2026-10-26 (v10 validation)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed on post-change data) |
|---|---|---|---|---|
| A | normal | 1 | none | none |
| B | ANOMALY overload | 1 | 50, 110 | 50, 110 |
| C | normal | 1->2 | none | none |
| D | ANOMALY overload | 2 | 70 | 70 |
| E | normal | 2->3 | 10* | 10* |
| F | ANOMALY waste | 3 | 80, 140 | 80, 140 |
| G | normal | 3->2 | none | none |
| H | ANOMALY waste | 2 | 59, 119, 179 | 59, 119, 179 |
| I | normal | 2->1 | none | none |

### 2026-10-27 (v11 validation)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed on post-change data) |
|---|---|---|---|---|
| A | normal | 1 | none | none |
| B | ANOMALY overload | 1 | 49*, 109 | 49*, 109 |
| C | normal | 1->2 | none | none |
| D | ANOMALY overload | 2 | 69 | 69 |
| E | normal | 2->3 | none | none |
| F | ANOMALY waste | 3 | 69, 129 | 69, 129 |
| G | normal | 3->2 | none | none |
| H | ANOMALY waste | 2 | 59, 119, 179 | 59, 119, 179 |
| I | normal | 2->1 | none | none |

### 2026-11-01 (v12 validation)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed on post-change data) |
|---|---|---|---|---|
| A | normal | 1 | none | none |
| B | ANOMALY overload | 1 | 60 | 60 |
| C | normal | 1->2 | 0* | 0* |
| D | ANOMALY overload | 2 | 80 | 80 |
| E | normal | 2->3 | none | none |
| F | ANOMALY waste | 3 | 80, 140 | 80, 140 |
| G | normal | 3->2 | none | none |
| H | ANOMALY waste | 2 | 70, 130 | 70, 130 |
| I | normal | 2->1 | none | none |

- v12: false wake-ups in normal phases 0 (all wake-ups in normal phases, the * ones included: 2); anomaly phases woken 12/12
- v13: false wake-ups in normal phases 0 (all wake-ups in normal phases, the * ones included: 2); anomaly phases woken 12/12

## 4. The campaigns' valid runs through both detectors

| Run | Method | Wake-ups before (v12 / v13) | First wake-up after (v12 / v13) | Pod-count changes before it |
|---|---|---|---|---|
| cpuhog 20261023_1159 (10-23) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |
| cpuhog 20261023_1455 (10-23) | hpa | 0 / 0 | +190 s / +130 s after the fault | 1->2 at +30 s, 2->3 at +80 s |
| cpuhog 20261027_0427 (10-26) | hpa | 0 / 0 | +140 s / +90 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0143 (10-28) | hpa | 0 / 0 | +140 s / +90 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0438 (10-28) | hpa | 0 / 0 | +140 s / +80 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0712 (10-28) | hpa | 0 / 0 | +130 s / +80 s after the fault | 1->2 at +20 s |
| cpuhog 20261028_1007 (10-28) | hpa | 0 / 0 | +140 s / +80 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_1514 (10-28) | hpa | 0 / 0 | +140 s / +90 s after the fault | 1->2 at +30 s |
| stuck 20261102_0309 (11-01) | hpa | 0 / 1 | +10 s / +10 s after the fault | 1->2 at -100 s |
| cpuhog 20261101_2308 (11-01) | hpa | 0 / 0 | +130 s / +80 s after the fault | 1->2 at +20 s |
| cpuhog 20261102_0415 (11-01) | hpa | 0 / 0 | +140 s / +80 s after the fault | 1->2 at +30 s |

campaign-2026-10-23: 24 valid runs, 2 differ; campaign-2026-10-26: 24 valid runs, 1 differ; campaign-2026-10-28: 33 valid runs, 5 differ; campaign-2026-11-01: 24 valid runs, 3 differ. Agent runs with the same wake-ups: 51/51. In the listed runs the HPA changed the pod count and nothing verified the change: v13 follows it on post-change data (none left in Prometheus for 23/10: there it judges the series once its readings are a minute long); v12 skipped 90 s and then needed 3 anomalous readings in a row.

## Checks

- verification: 117 actions with post-change readings; recorded STABLE -> v13 STABLE: 113; recorded UNSTABLE -> v13 STABLE: 1; recorded UNSTABLE -> v13 UNSTABLE: 3; same verdict with the rollout 3 s later: 117/117
- detector after a STABLE action: 1 of 113 with a wake-up in either detector
- validations: v13 false wake-ups in normal phases 0 (v12 0), all wake-ups in normal phases 2 (v12 2), anomaly phases woken 12/12 (v12 12/12)
- campaigns: agent runs with the same wake-ups 51/51
