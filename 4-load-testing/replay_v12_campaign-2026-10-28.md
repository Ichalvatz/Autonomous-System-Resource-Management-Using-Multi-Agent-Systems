# Replay of the health model (campaign-2026-10-28)

*`replay_model.py`, 2026-11-01 15:48. Model OneClassSVM-NFR-v11, trained 2026-11-01T15:45:55: gamma 0.1; noise_eps 0.142; healthy bands (rps) {1: [1.0, 87.3], 2: [73.5, 162.1], 3: [123.3, 251.3]}.*

## 2. Detector validation A-I (2026-10-23, live readings of the v9 dry run)

| Phase | Expected | Current model: wake-ups (s after the phase start) | v9 wake-ups |
|---|---|---|---|
| A | normal | none | none |
| B | ANOMALY overload | 52, 112 | 52 |
| C | normal | none | 2 |
| D | ANOMALY overload | 54, 114 | 54, 114 |
| E | normal | none | none |
| F | ANOMALY waste | 75, 135 | 75, 135 |
| G | normal | none | none |
| H | ANOMALY waste | 66, 126 | 66, 126 |
| I | normal | 6 (lag) | 6 |

False wake-ups in normal phases (not counting the replica-metric lag): 0; anomaly phases woken: 4/4.

## 2. Detector validation A-I (2026-10-26, live readings of the v10 dry run)

| Phase | Expected | Current model: wake-ups (s after the phase start) | v10 wake-ups |
|---|---|---|---|
| A | normal | none | none |
| B | ANOMALY overload | 52, 113 | 52, 113 |
| C | normal | none | none |
| D | ANOMALY overload | 74 | 84 |
| E | normal | none | none |
| F | ANOMALY waste | 76, 136 | 76, 136 |
| G | normal | none | none |
| H | ANOMALY waste | 56, 116, 177 | 56, 116, 177 |
| I | normal | none | none |

False wake-ups in normal phases (not counting the replica-metric lag): 0; anomaly phases woken: 4/4.

## 2. Detector validation A-I (2026-10-27, live readings of the v11 dry run)

| Phase | Expected | Current model: wake-ups (s after the phase start) | v11 wake-ups |
|---|---|---|---|
| A | normal | none | none |
| B | ANOMALY overload | 52, 112 | 52, 112 |
| C | normal | none | none |
| D | ANOMALY overload | 74 | 74 |
| E | normal | none | none |
| F | ANOMALY waste | 75, 135 | 75, 135 |
| G | normal | none | none |
| H | ANOMALY waste | 56, 117, 177 | 56, 117, 177 |
| I | normal | none | none |

False wake-ups in normal phases (not counting the replica-metric lag): 0; anomaly phases woken: 4/4.

## 3. Campaign runs through the detector (33 valid runs)

| Run | Method | False wake-ups | Current model: first wake-up | v11 model, same series | Recorded agent's first wake-up |
|---|---|---|---|---|---|
| baseline 20261028_0227 | hpa | 0 | 1510 s after the start | 1510 s after the start | (HPA run) |
| baseline 20261028_0311 | llm-v11 | 0 | 500 s after the start | 490 s after the start | 481 s after the start |
| baseline 20261028_0501 | hpa | 0 | 1520 s after the start | 1520 s after the start | (HPA run) |
| baseline 20261028_0628 | llm-v11 | 0 | 490 s after the start | 490 s after the start | 491 s after the start |
| baseline 20261028_0756 | hpa | 0 | 1510 s after the start | 1510 s after the start | (HPA run) |
| baseline 20261028_0924 | llm-v11 | 0 | 490 s after the start | 490 s after the start | 490 s after the start |
| baseline 20261028_1051 | hpa | 0 | 1520 s after the start | 1520 s after the start | (HPA run) |
| baseline 20261028_1241 | llm-v11 | 0 | 490 s after the start | 490 s after the start | 491 s after the start |
| baseline 20261028_1325 | hpa | 0 | 1510 s after the start | 1510 s after the start | (HPA run) |
| baseline 20261028_1537 | llm-v11 | 0 | 490 s after the start | 490 s after the start | 490 s after the start |
| baseline 20261028_1620 | hpa | 0 | 1520 s after the start | 1520 s after the start | (HPA run) |
| stuck 20261028_0100 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| stuck 20261028_0122 | hpa | 0 | 30 s after the fault | 30 s after the fault | (HPA run) |
| stuck 20261028_0355 | hpa | 0 | 40 s after the fault | 40 s after the fault | (HPA run) |
| stuck 20261028_0417 | llm-v11 | 0 | 40 s after the fault | 40 s after the fault | 40 s after the fault |
| stuck 20261028_0606 | hpa | 0 | 30 s after the fault | 30 s after the fault | (HPA run) |
| stuck 20261028_0734 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| stuck 20261028_0902 | hpa | 0 | 40 s after the fault | 40 s after the fault | (HPA run) |
| stuck 20261028_1029 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| stuck 20261028_1135 | hpa | 0 | 30 s after the fault | 30 s after the fault | (HPA run) |
| stuck 20261028_1409 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| stuck 20261028_1431 | hpa | 0 | 30 s after the fault | 30 s after the fault | (HPA run) |
| cpuhog 20261028_0143 | hpa | 0 | 140 s after the fault | 140 s after the fault | (HPA run) |
| cpuhog 20261028_0205 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| cpuhog 20261028_0438 | hpa | 0 | 140 s after the fault | 140 s after the fault | (HPA run) |
| cpuhog 20261028_0545 | llm-v11 | 0 | 40 s after the fault | 40 s after the fault | 39 s after the fault |
| cpuhog 20261028_0712 | hpa | 0 | 130 s after the fault | 130 s after the fault | (HPA run) |
| cpuhog 20261028_0840 | llm-v11 | 0 | 40 s after the fault | 40 s after the fault | 40 s after the fault |
| cpuhog 20261028_1007 | hpa | 0 | 140 s after the fault | 140 s after the fault | (HPA run) |
| cpuhog 20261028_1157 | llm-v11 | 0 | 40 s after the fault | 40 s after the fault | 40 s after the fault |
| cpuhog 20261028_1219 | hpa | 0 | 40 s after the fault | 40 s after the fault | (HPA run) |
| cpuhog 20261028_1453 | llm-v11 | 0 | 30 s after the fault | 30 s after the fault | 30 s after the fault |
| cpuhog 20261028_1514 | hpa | 0 | 140 s after the fault | 140 s after the fault | (HPA run) |

Faults woken: 22/22; false wake-ups: 0; normal-load agent runs with the first wake-up no later than the v11 model's on the same series: 4/5 (than the recorded agent's, which the live detector timed off the series' 10 s grid: 4/5). After a run's first wake-up the series holds what the recorded agent or the HPA did, so later wake-ups are not compared.

## 4. Verification of the agent's actions (the recorded readings, then series.json)

| Run | Action | Recorded: ended at | Current verdict | at (s after the rollout) | readings from series |
|---|---|---|---|---|---|
| baseline 20261028_0311 | ['scale 1->2'] | 50 s | STABLE | 50 | 0 |
| baseline 20261028_0311 | ['scale 2->3'] | 50 s | STABLE | 40 | 0 |
| baseline 20261028_0311 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_0311 | ['scale 2->1'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_0628 | ['scale 1->2'] | 40 s | STABLE | 40 | 0 |
| baseline 20261028_0628 | ['scale 2->3'] | 20 s | STABLE | 20 | 0 |
| baseline 20261028_0628 | ['scale 3->2'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_0628 | ['scale 2->1'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_0924 | ['scale 1->2'] | 50 s | STABLE | 50 | 0 |
| baseline 20261028_0924 | ['scale 2->3'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_0924 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_0924 | ['scale 2->1'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_1241 | ['scale 1->2'] | 30 s | STABLE | 30 | 0 |
| baseline 20261028_1241 | ['scale 2->3'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_1241 | ['scale 3->2'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_1241 | ['scale 2->1'] | 10 s | STABLE | 10 | 0 |
| baseline 20261028_1537 | ['scale 1->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_1537 | ['scale 2->3'] | 30 s | STABLE | 30 | 0 |
| baseline 20261028_1537 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261028_1537 | ['scale 2->1'] | 0 s | STABLE | 0 | 0 |
| stuck 20261028_0100 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261028_0417 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261028_0734 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261028_1029 | ['restart'] | 70 s | STABLE | 60 | 0 |
| stuck 20261028_1409 | ['restart'] | 70 s | STABLE | 70 | 0 |
| cpuhog 20261028_0205 | ['restart'] | 50 s | STABLE | 50 | 0 |
| cpuhog 20261028_0545 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261028_0840 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261028_1157 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261028_1453 | ['restart'] | 60 s | STABLE | 60 | 0 |

STABLE: 30/30 (the recorded column is when the recorded verification ended).

## 5. Minimum pod count at the agent's wake-ups (agent._minimum_pods)

| Woke at | State | Trend (rps/min) | Minimum (current model) | Right | |
|---|---|---|---|---|---|
| 10-28 01:07:18 | 1 pod(s), 57 rps, p95 4.59 s, errors 49% | -1.2 | 1 | 1 (restart) | ✅ |
| 10-28 02:12:37 | 1 pod(s), 56 rps, p95 1.53 s, errors 0% | -1.2 | 1 | 1 (restart) | ✅ |
| 10-28 03:21:45 | 1 pod(s), 94 rps, p95 0.31 s, errors 0% | 19.2 | 2 | 2 (scale 1->2) | ✅ |
| 10-28 03:29:29 | 2 pod(s), 172 rps, p95 0.25 s, errors 0% | 21.8 | 3 | 3 (scale 2->3) | ✅ |
| 10-28 03:39:00 | 3 pod(s), 113 rps, p95 0.07 s, errors 0% | -25.6 | 2 | 2 (scale 3->2) | ✅ |
| 10-28 03:45:35 | 2 pod(s), 68 rps, p95 0.07 s, errors 0% | -15.7 | 1 | 1 (scale 2->1) | ✅ |
| 10-28 04:24:01 | 1 pod(s), 57 rps, p95 4.58 s, errors 63% | -0.8 | 1 | 1 (restart) | ✅ |
| 10-28 05:51:59 | 1 pod(s), 56 rps, p95 1.42 s, errors 0% | -1.3 | 1 | 1 (restart) | ✅ |
| 10-28 06:39:19 | 1 pod(s), 96 rps, p95 0.32 s, errors 0% | 19.5 | 2 | 2 (scale 1->2) | ✅ |
| 10-28 06:46:50 | 2 pod(s), 170 rps, p95 0.28 s, errors 0% | 20.8 | 3 | 3 (scale 2->3) | ✅ |
| 10-28 06:56:17 | 3 pod(s), 114 rps, p95 0.08 s, errors 0% | -26.0 | 2 | 2 (scale 3->2) | ✅ |
| 10-28 07:03:04 | 2 pod(s), 67 rps, p95 0.07 s, errors 0% | -15.1 | 1 | 1 (scale 2->1) | ✅ |
| 10-28 07:41:27 | 1 pod(s), 57 rps, p95 4.61 s, errors 51% | -1.1 | 1 | 1 (restart) | ✅ |
| 10-28 08:47:18 | 1 pod(s), 56 rps, p95 1.65 s, errors 0% | -0.9 | 1 | 1 (restart) | ✅ |
| 10-28 09:34:32 | 1 pod(s), 95 rps, p95 0.28 s, errors 0% | 20.2 | 2 | 2 (scale 1->2) | ✅ |
| 10-28 09:42:12 | 2 pod(s), 173 rps, p95 0.26 s, errors 0% | 21.9 | 3 | 3 (scale 2->3) | ✅ |
| 10-28 09:51:39 | 3 pod(s), 112 rps, p95 0.08 s, errors 0% | -26.0 | 2 | 2 (scale 3->2) | ✅ |
| 10-28 09:58:14 | 2 pod(s), 67 rps, p95 0.08 s, errors 0% | -15.7 | 1 | 1 (scale 2->1) | ✅ |
| 10-28 10:36:29 | 1 pod(s), 57 rps, p95 4.59 s, errors 48% | -2.0 | 1 | 1 (restart) | ✅ |
| 10-28 12:04:41 | 1 pod(s), 56 rps, p95 1.47 s, errors 0% | -1.1 | 1 | 1 (restart) | ✅ |
| 10-28 12:52:07 | 1 pod(s), 97 rps, p95 0.30 s, errors 0% | 20.2 | 2 | 2 (scale 1->2) | ✅ |
| 10-28 12:59:36 | 2 pod(s), 171 rps, p95 0.21 s, errors 0% | 22.2 | 3 | 3 (scale 2->3) | ✅ |
| 10-28 13:09:08 | 3 pod(s), 114 rps, p95 0.07 s, errors 0% | -26.0 | 2 | 2 (scale 3->2) | ✅ |
| 10-28 13:16:03 | 2 pod(s), 66 rps, p95 0.09 s, errors 0% | -15.3 | 1 | 1 (scale 2->1) | ✅ |
| 10-28 14:16:14 | 1 pod(s), 57 rps, p95 4.60 s, errors 56% | -0.4 | 1 | 1 (restart) | ✅ |
| 10-28 15:00:04 | 1 pod(s), 56 rps, p95 1.63 s, errors 0% | -1.3 | 1 | 1 (restart) | ✅ |
| 10-28 15:47:28 | 1 pod(s), 96 rps, p95 0.29 s, errors 0% | 19.5 | 2 | 2 (scale 1->2) | ✅ |
| 10-28 15:55:00 | 2 pod(s), 171 rps, p95 0.27 s, errors 0% | 21.8 | 3 | 3 (scale 2->3) | ✅ |
| 10-28 16:04:30 | 3 pod(s), 114 rps, p95 0.08 s, errors 0% | -25.8 | 2 | 2 (scale 3->2) | ✅ |
| 10-28 16:11:21 | 2 pod(s), 66 rps, p95 0.08 s, errors 0% | -15.6 | 1 | 1 (scale 2->1) | ✅ |

Agree: 30/30.

Idle load (A31): minimum pod count 1 rps -> 1, 1.5 rps -> 1, 2 rps -> 1, 3 rps -> 1, 4 rps -> 1 (the same for 2 and 3 pods: True).

## For information: the manual demo run of 2026-11-01 (demo.js; series from Prometheus)

- current model: wake-ups at +440 s, +730 s, +1340 s; anomalous readings on 1 pod at 10-80 rps: 0
- v11 model: wake-ups at +440 s, +730 s, +1340 s; anomalous readings on 1 pod at 10-80 rps: 1 (18.0 rps)

## Acceptance (A31, criteria 2-5)

- PASS: 2. validation 2026-10-23: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-23: 4/4 anomaly phases woken
- PASS: 2. validation 2026-10-26: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-26: 4/4 anomaly phases woken
- PASS: 2. validation 2026-10-27: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-27: 4/4 anomaly phases woken
- PASS: 3. campaign: a wake-up after every fault
- PASS: 3. campaign: false wake-ups <= 1
- **FAIL**: 3. campaign: normal load, first wake-up not later than the v11 model's on the same series
- PASS: 4. verification: STABLE for all 30 actions
- PASS: 5. minimum pod count agrees with the right action at all 30 wake-ups
- PASS: 5. minimum pod count at idle load (1-4 rps, 1-3 pods) = 1
