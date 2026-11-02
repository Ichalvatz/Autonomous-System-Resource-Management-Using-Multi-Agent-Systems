# A32: the detector's follow of a pod-count change (v13) against v12's 90 s skip

*`replay_follow.py`, 2026-11-02 18:04. Model OneClassSVM-NFR-v11 trained 2026-11-01T15:45:55: gamma 0.1, noise_eps 0.142. Detector: 3 anomalous readings in a row, 60 s cooldown; the follow: health_model.follow_verdict ('worse' from 10 s, 'not improving' from 60 s, still anomalous after 240 s).*

## 1. After the agent's own scale actions (phase 2)

86 scale actions changed the pod count (re-wakes excluded: v12 skipped nothing there). In 81 of them every reading v12 skipped is healthy for the current model and neither detector wakes. The others:

| Run | Agent returned | Change | Scores in the 90 s v12 skipped | Worst reading | v12 wake-up | v13 wake-up |
|---|---|---|---|---|---|---|
| eval_llm_20261026_1521 | 15:39:50 | 2->3 (STABLE) | -0.95 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 | p95 0.351 s at 171 rps | none | none |
| eval_llm_20261027_0155 | 02:06:25 | 1->2 (STABLE) | -0.39 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 | p95 0.301 s at 103 rps | none | none |
| eval_llm_20261027_0340 | 03:58:32 | 2->3 (STABLE) | -0.08 +0.35 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 | p95 0.282 s at 182 rps | none | none |
| eval_llm_20261028_0924 | 09:42:27 | 2->3 (STABLE) | +0.67 +1.00 +1.00 +1.00 -1.09 -0.95 -0.97 -0.79 -1.03 | p95 0.367 s at 194 rps | none | +65 s |
| eval_llm_20261102_0604 | 06:22:51 | 2->3 (STABLE) | -0.63 -0.77 -0.68 -0.64 -0.35 +1.00 +1.00 +1.00 +1.00 | p95 0.332 s at 182 rps | none | none |

## 2. Changes nobody verified: the live detector validations A-I (the script scales by hand)

Wake-ups in seconds after the phase start; * = the streak started within 30 s of it (the previous phase still in the 1 m window, counted as lag as in replay_model.py); U = the follow ended UNSTABLE.

### 2026-10-26 (v10 validation, 205 readings)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed) | no rule | Scores of the first 100 s |
|---|---|---|---|---|---|---|
| A | normal | 1 | none | none | none |  |
| B | ANOMALY overload | 1 | 50, 110 | 50, 110 | 50, 110 |  |
| C | normal | 1->2 | none | none | none | -1.96 -1.31 -1.32 -1.27 -0.81 +1.00 +1.00 +1.00 +1.00 +1.00 |
| D | ANOMALY overload | 2 | 70 | 70 | 70 |  |
| E | normal | 2->3 | 10* | 10* | 10* | -0.62 -1.00 -0.68 -0.38 -0.36 +1.00 +1.00 +1.00 +1.00 +1.00 |
| F | ANOMALY waste | 3 | 80, 140 | 80, 140 | 80, 140 |  |
| G | normal | 3->2 | none | none | none | -0.37 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| H | ANOMALY waste | 2 | 59, 119, 179 | 59, 119, 179 | 59, 119, 179 |  |
| I | normal | 2->1 | none | none | none | -0.83 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 |

### 2026-10-27 (v11 validation, 205 readings)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed) | no rule | Scores of the first 100 s |
|---|---|---|---|---|---|---|
| A | normal | 1 | none | none | none |  |
| B | ANOMALY overload | 1 | 49*, 109 | 49*, 109 | 49*, 109 |  |
| C | normal | 1->2 | none | none | none | +0.38 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| D | ANOMALY overload | 2 | 69 | 69 | 69 |  |
| E | normal | 2->3 | none | none | none | +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| F | ANOMALY waste | 3 | 69, 129 | 69, 129 | 69, 129 |  |
| G | normal | 3->2 | none | none | none | +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| H | ANOMALY waste | 2 | 59, 119, 179 | 59, 119, 179 | 59, 119, 179 |  |
| I | normal | 2->1 | none | none | none | +0.85 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 |

### 2026-11-01 (v12 validation, 205 readings)

| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed) | no rule | Scores of the first 100 s |
|---|---|---|---|---|---|---|
| A | normal | 1 | none | none | none |  |
| B | ANOMALY overload | 1 | 60 | 60 | 60 |  |
| C | normal | 1->2 | 0* | 0* | 0*, 60* | -3.00 -2.63 -2.56 -1.82 -1.04 -1.03 -0.96 +1.00 +1.00 +1.00 |
| D | ANOMALY overload | 2 | 80 | 80 | 80 |  |
| E | normal | 2->3 | none | none | none | -1.17 -1.21 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| F | ANOMALY waste | 3 | 80, 140 | 80, 140 | 80, 140 |  |
| G | normal | 3->2 | none | none | none | -0.36 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 +1.00 |
| H | ANOMALY waste | 2 | 70, 130 | 70, 130 | 70, 130 |  |
| I | normal | 2->1 | none | none | none | +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 +0.84 |

- v12: false wake-ups in normal phases 0 (all wake-ups in normal phases, the * ones included: 2); anomaly phases woken 12/12
- v13: false wake-ups in normal phases 0 (all wake-ups in normal phases, the * ones included: 2); anomaly phases woken 12/12
- no rule: false wake-ups in normal phases 0 (all wake-ups in normal phases, the * ones included: 3); anomaly phases woken 12/12

## 3. The campaigns' valid runs through both detectors

| Run | Method | Wake-ups before (v12 / v13) | First wake-up after (v12 / v13) | Pod-count changes before it |
|---|---|---|---|---|
| cpuhog 20261023_1159 (10-23) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |
| cpuhog 20261023_1455 (10-23) | hpa | 0 / 0 | +190 s / +170 s after the fault | 1->2 at +30 s, 2->3 at +80 s |
| cpuhog 20261027_0427 (10-26) | hpa | 0 / 0 | +140 s / +100 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0143 (10-28) | hpa | 0 / 0 | +140 s / +110 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0438 (10-28) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_0712 (10-28) | hpa | 0 / 0 | +130 s / +110 s after the fault | 1->2 at +20 s |
| cpuhog 20261028_1007 (10-28) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |
| cpuhog 20261028_1514 (10-28) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |
| stuck 20261102_0309 (11-01) | hpa | 0 / 1 | +10 s / +50 s after the fault | 1->2 at -100 s |
| cpuhog 20261101_2308 (11-01) | hpa | 0 / 0 | +130 s / +90 s after the fault | 1->2 at +20 s |
| cpuhog 20261102_0415 (11-01) | hpa | 0 / 0 | +140 s / +120 s after the fault | 1->2 at +30 s |

campaign-2026-10-23: 24 valid runs, 2 differ; campaign-2026-10-26: 24 valid runs, 1 differ; campaign-2026-10-28: 33 valid runs, 5 differ; campaign-2026-11-01: 24 valid runs, 3 differ. Agent runs with the same wake-ups: 51/51. In the listed runs the HPA changed the pod count and nothing verified the change: v13 follows it and calls it UNSTABLE once the 1 m windows hold only post-change data and the score has not risen; v12 skipped 90 s and then needed 3 anomalous readings in a row.

## Checks

- validations: v13 false wake-ups in normal phases 0 (v12 0), all wake-ups in normal phases 2 (v12 2, no rule 3), anomaly phases woken 12/12 (v12 12/12)
- campaigns: agent runs with the same wake-ups 51/51
