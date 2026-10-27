# Replay of the health model (campaign-2026-10-26)

*`replay_model.py`, 2026-10-27 21:53. Model OneClassSVM-NFR-v11, trained 2026-10-27T21:51:41: gamma 0.5; noise_eps 0.142; healthy bands (rps) {1: [3.9, 87.0], 2: [73.3, 161.5], 3: [123.7, 251.5]}.*

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

## 3. Campaign runs through the detector (24 valid runs)

| Run | Method | False wake-ups | Current model: first wake-up | Recorded agent's first wake-up |
|---|---|---|---|---|
| baseline 20261026_1713 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261026_1903 | hpa | 0 | 1520 s after the start | (HPA run) |
| baseline 20261026_1947 | llm-v10 | 0 | 490 s after the start | 481 s after the start |
| baseline 20261026_2114 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261026_2325 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261027_0020 | llm-v10 | 0 | 490 s after the start | 491 s after the start |
| baseline 20261027_0155 | llm-v10 | 0 | 490 s after the start | 491 s after the start |
| baseline 20261027_0340 | llm-v10 | 0 | 480 s after the start | 481 s after the start |
| stuck 20261026_1607 | hpa | 0 | 30 s after the fault | (HPA run) |
| stuck 20261026_1651 | llm-v10 | 0 | 29 s after the fault | 29 s after the fault |
| stuck 20261026_1819 | hpa | 0 | 30 s after the fault | (HPA run) |
| stuck 20261026_2030 | hpa | 0 | 40 s after the fault | (HPA run) |
| stuck 20261026_2219 | hpa | 0 | 40 s after the fault | (HPA run) |
| stuck 20261027_0111 | llm-v10 | 0 | 40 s after the fault | 40 s after the fault |
| stuck 20261027_0239 | llm-v10 | 0 | 30 s after the fault | 30 s after the fault |
| stuck 20261027_0449 | llm-v10 | 0 | 30 s after the fault | 30 s after the fault |
| cpuhog 20261026_1629 | hpa | 0 | 30 s after the fault | (HPA run) |
| cpuhog 20261026_1757 | llm-v10 | 0 | 40 s after the fault | 30 s after the fault |
| cpuhog 20261026_2052 | hpa | 0 | 30 s after the fault | (HPA run) |
| cpuhog 20261026_2242 | hpa | 0 | 30 s after the fault | (HPA run) |
| cpuhog 20261026_2304 | llm-v10 | 0 | 30 s after the fault | 31 s after the fault |
| cpuhog 20261027_0133 | llm-v10 | 0 | 40 s after the fault | 40 s after the fault |
| cpuhog 20261027_0302 | llm-v10 | 0 | 40 s after the fault | 40 s after the fault |
| cpuhog 20261027_0427 | hpa | 0 | 140 s after the fault | (HPA run) |

Faults woken: 16/16; false wake-ups: 0; normal-load agent runs with the first wake-up no later than the recorded agent's: 3/4. After a run's first wake-up the series holds what the recorded agent or the HPA did, so later wake-ups are not compared.

## 4. Verification of the agent's actions (the recorded readings, then series.json)

| Run | Action | Recorded: ended at | Current verdict | at (s after the rollout) | readings from series |
|---|---|---|---|---|---|
| baseline 20261026_1947 | ['scale 1->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261026_1947 | ['scale 2->3'] | 0 s | STABLE | 0 | 0 |
| baseline 20261026_1947 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261026_1947 | ['scale 2->1'] | 0 s | STABLE | 0 | 0 |
| baseline 20261027_0020 | ['scale 1->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261027_0020 | ['scale 2->3'] | 10 s | STABLE | 10 | 0 |
| baseline 20261027_0020 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261027_0020 | ['scale 2->1'] | 10 s | STABLE | 10 | 0 |
| baseline 20261027_0155 | ['scale 1->2'] | 0 s | STABLE | 20 | 2 |
| baseline 20261027_0155 | ['scale 2->3'] | 30 s | STABLE | 30 | 0 |
| baseline 20261027_0155 | ['scale 3->2'] | 10 s | STABLE | 10 | 0 |
| baseline 20261027_0155 | ['scale 2->1'] | 0 s | STABLE | 0 | 0 |
| baseline 20261027_0340 | ['scale 1->2'] | 20 s | STABLE | 20 | 0 |
| baseline 20261027_0340 | ['scale 2->3'] | 20 s | STABLE | 40 | 2 |
| baseline 20261027_0340 | ['scale 3->2'] | 0 s | STABLE | 0 | 0 |
| baseline 20261027_0340 | ['scale 2->1'] | 10 s | STABLE | 10 | 0 |
| stuck 20261026_1651 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261027_0111 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261027_0239 | ['restart'] | 60 s | STABLE | 60 | 0 |
| stuck 20261027_0449 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261026_1757 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261026_2304 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261027_0133 | ['restart'] | 60 s | STABLE | 60 | 0 |
| cpuhog 20261027_0302 | ['restart'] | 60 s | STABLE | 60 | 0 |

STABLE: 24/24 (the recorded column is when the recorded verification ended).

## 5. Minimum pod count at the agent's wake-ups (agent._minimum_pods)

| Woke at | State | Trend (rps/min) | Minimum (current model) | Right | |
|---|---|---|---|---|---|
| 10-26 16:58:44 | 1 pod(s), 57 rps, p95 4.60 s, errors 52% | -0.7 | 1 | 1 (restart) | ✅ |
| 10-26 18:04:21 | 1 pod(s), 56 rps, p95 1.72 s, errors 7% | -1.3 | 1 | 1 (restart) | ✅ |
| 10-26 19:57:22 | 1 pod(s), 95 rps, p95 0.22 s, errors 0% | 19.9 | 2 | 2 (scale 1->2) | ✅ |
| 10-26 20:04:47 | 2 pod(s), 164 rps, p95 0.29 s, errors 0% | 21.2 | 3 | 3 (scale 2->3) | ✅ |
| 10-26 20:14:34 | 3 pod(s), 112 rps, p95 0.08 s, errors 0% | -26.2 | 2 | 2 (scale 3->2) | ✅ |
| 10-26 20:21:15 | 2 pod(s), 68 rps, p95 0.08 s, errors 0% | -15.1 | 1 | 1 (scale 2->1) | ✅ |
| 10-26 23:11:05 | 1 pod(s), 56 rps, p95 1.49 s, errors 0% | -1.3 | 1 | 1 (restart) | ✅ |
| 10-27 00:31:31 | 1 pod(s), 95 rps, p95 0.37 s, errors 0% | 20.5 | 2 | 2 (scale 1->2) | ✅ |
| 10-27 00:38:52 | 2 pod(s), 168 rps, p95 0.25 s, errors 0% | 22.1 | 3 | 3 (scale 2->3) | ✅ |
| 10-27 00:48:37 | 3 pod(s), 112 rps, p95 0.08 s, errors 0% | -25.6 | 2 | 2 (scale 3->2) | ✅ |
| 10-27 00:55:19 | 2 pod(s), 67 rps, p95 0.07 s, errors 0% | -15.6 | 1 | 1 (scale 2->1) | ✅ |
| 10-27 01:17:59 | 1 pod(s), 57 rps, p95 4.60 s, errors 62% | -0.5 | 1 | 1 (restart) | ✅ |
| 10-27 01:40:18 | 1 pod(s), 56 rps, p95 1.82 s, errors 0% | -1.6 | 1 | 1 (restart) | ✅ |
| 10-27 02:06:07 | 1 pod(s), 97 rps, p95 0.33 s, errors 0% | 20.5 | 2 | 2 (scale 1->2) | ✅ |
| 10-27 02:13:37 | 2 pod(s), 170 rps, p95 0.26 s, errors 0% | 21.1 | 3 | 3 (scale 2->3) | ✅ |
| 10-27 02:23:08 | 3 pod(s), 114 rps, p95 0.08 s, errors 0% | -26.2 | 2 | 2 (scale 3->2) | ✅ |
| 10-27 02:29:56 | 2 pod(s), 67 rps, p95 0.09 s, errors 0% | -15.6 | 1 | 1 (scale 2->1) | ✅ |
| 10-27 02:46:25 | 1 pod(s), 57 rps, p95 4.59 s, errors 52% | -1.1 | 1 | 1 (restart) | ✅ |
| 10-27 03:08:57 | 1 pod(s), 56 rps, p95 1.75 s, errors 0% | -0.8 | 1 | 1 (restart) | ✅ |
| 10-27 03:50:24 | 1 pod(s), 94 rps, p95 0.31 s, errors 0% | 20.1 | 2 | 2 (scale 1->2) | ✅ |
| 10-27 03:58:06 | 2 pod(s), 171 rps, p95 0.23 s, errors 0% | 21.4 | 3 | 3 (scale 2->3) | ✅ |
| 10-27 04:07:34 | 3 pod(s), 113 rps, p95 0.09 s, errors 0% | -26.4 | 2 | 2 (scale 3->2) | ✅ |
| 10-27 04:14:18 | 2 pod(s), 68 rps, p95 0.08 s, errors 0% | -15.3 | 1 | 1 (scale 2->1) | ✅ |
| 10-27 04:56:46 | 1 pod(s), 57 rps, p95 4.60 s, errors 48% | -1.8 | 1 | 1 (restart) | ✅ |

Agree: 24/24.

## Acceptance (A28 / A30, criteria 2-5)

- PASS: 2. validation 2026-10-23: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-23: 4/4 anomaly phases woken
- PASS: 2. validation 2026-10-26: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-26: 4/4 anomaly phases woken
- PASS: 3. campaign: a wake-up after every fault
- PASS: 3. campaign: false wake-ups <= 1
- **FAIL**: 3. campaign: normal load, first wake-up not later than the recorded agent's
- PASS: 4. verification: STABLE for all 24 actions
- PASS: 5. minimum pod count agrees with the right action at all 24 wake-ups
