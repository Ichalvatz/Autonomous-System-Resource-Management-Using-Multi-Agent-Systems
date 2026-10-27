# Replay of the health model (campaign-2026-10-23)

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
| baseline 20261023_1030 | hpa | 0 | 1520 s after the start | (HPA run) |
| baseline 20261023_1243 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261023_1327 | llm-v9 | 0 | 490 s after the start | 521 s after the start |
| baseline 20261023_1517 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261023_1707 | hpa | 0 | 1510 s after the start | (HPA run) |
| baseline 20261023_1752 | llm-v9 | 0 | 490 s after the start | 501 s after the start |
| baseline 20261023_1937 | llm-v9 | 0 | 490 s after the start | 471 s after the start |
| baseline 20261023_2024 | llm-v9 | 0 | 490 s after the start | 511 s after the start |
| stuck 20261023_0706 | llm-v9 | 0 | 40 s after the fault | 40 s after the fault |
| stuck 20261023_0728 | hpa | 0 | 40 s after the fault | (HPA run) |
| stuck 20261023_1115 | llm-v9 | 0 | 40 s after the fault | 40 s after the fault |
| stuck 20261023_1136 | hpa | 0 | 30 s after the fault | (HPA run) |
| stuck 20261023_1411 | hpa | 0 | 40 s after the fault | (HPA run) |
| stuck 20261023_1433 | llm-v9 | 0 | 30 s after the fault | 30 s after the fault |
| stuck 20261023_1623 | hpa | 0 | 30 s after the fault | (HPA run) |
| stuck 20261023_1847 | llm-v9 | 0 | 40 s after the fault | 40 s after the fault |
| cpuhog 20261023_0750 | llm-v9 | 0 | 40 s after the fault | 40 s after the fault |
| cpuhog 20261023_0812 | hpa | 0 | 40 s after the fault | (HPA run) |
| cpuhog 20261023_1159 | hpa | 0 | 140 s after the fault | (HPA run) |
| cpuhog 20261023_1221 | llm-v9 | 0 | 30 s after the fault | 0 s after the fault |
| cpuhog 20261023_1455 | hpa | 0 | 190 s after the fault | (HPA run) |
| cpuhog 20261023_1601 | llm-v9 | 1 | 30 s after the fault | 31 s after the fault |
| cpuhog 20261023_1645 | hpa | 0 | 30 s after the fault | (HPA run) |
| cpuhog 20261023_1915 | llm-v9 | 0 | 30 s after the fault | 30 s after the fault |

Faults woken: 16/16; false wake-ups: 1; normal-load agent runs with the first wake-up no later than the recorded agent's: 3/4. After a run's first wake-up the series holds what the recorded agent or the HPA did, so later wake-ups are not compared.

## 4. Verification of the agent's actions (the recorded readings, then series.json)

| Run | Action | Recorded: ended at | Current verdict | at (s after the rollout) | readings from series |
|---|---|---|---|---|---|
| baseline 20261023_1327 | ['scale 1->2'] | 60 s | STABLE | 50 | 0 |
| baseline 20261023_1327 | ['scale 2->3'] | 30 s | STABLE | 10 | 0 |
| baseline 20261023_1327 | ['scale 3->2'] | 20 s | STABLE | 10 | 0 |
| baseline 20261023_1327 | ['scale 2->1'] | 30 s | STABLE | 10 | 0 |
| baseline 20261023_1752 | ['scale 1->2'] | 40 s | STABLE | 20 | 0 |
| baseline 20261023_1752 | ['scale 2->3'] | 50 s | STABLE | 30 | 0 |
| baseline 20261023_1752 | ['scale 3->2'] | 20 s | STABLE | 10 | 0 |
| baseline 20261023_1752 | ['scale 2->1'] | 30 s | STABLE | 10 | 0 |
| baseline 20261023_1937 | ['scale 1->2'] | 10 s | STABLE | 0 | 0 |
| baseline 20261023_1937 | ['scale 2->3'] | 30 s | STABLE | 0 | 0 |
| baseline 20261023_1937 | ['scale 3->2'] | 20 s | STABLE | 10 | 0 |
| baseline 20261023_1937 | ['scale 2->1'] | 20 s | STABLE | 10 | 0 |
| baseline 20261023_2024 | ['scale 1->2'] | 70 s | STABLE | 60 | 0 |
| baseline 20261023_2024 | ['scale 2->3'] | 30 s | STABLE | 0 | 0 |
| baseline 20261023_2024 | ['scale 3->2'] | 20 s | STABLE | 10 | 0 |
| baseline 20261023_2024 | ['scale 2->1'] | 20 s | STABLE | 10 | 0 |
| stuck 20261023_0706 | ['restart'] | 70 s | STABLE | 60 | 0 |
| stuck 20261023_1115 | ['restart'] | 70 s | STABLE | 60 | 0 |
| stuck 20261023_1433 | ['restart'] | 90 s | STABLE | 70 | 0 |
| stuck 20261023_1847 | ['restart'] | 70 s | STABLE | 60 | 0 |
| cpuhog 20261023_0750 | ['restart'] | 70 s | STABLE | 60 | 0 |
| cpuhog 20261023_1221 | ['restart'] | 70 s | STABLE | 60 | 0 |
| cpuhog 20261023_1601 | ['restart'] | 60 s | STABLE | 50 | 0 |

STABLE: 23/23 (the recorded column is when the recorded verification ended).

## 5. Minimum pod count at the agent's wake-ups (agent._minimum_pods)

| Woke at | State | Trend (rps/min) | Minimum (current model) | Right | |
|---|---|---|---|---|---|
| 10-23 07:13:22 | 1 pod(s), 57 rps, p95 4.61 s, errors 60% | -0.7 | 1 | 1 (restart) | ✅ |
| 10-23 07:57:19 | 1 pod(s), 56 rps, p95 1.49 s, errors 10% | -1.0 | 1 | 1 (restart) | ✅ |
| 10-23 11:22:02 | 1 pod(s), 57 rps, p95 4.61 s, errors 60% | -0.6 | 1 | 1 (restart) | ✅ |
| 10-23 12:27:55 | 1 pod(s), 57 rps, p95 0.25 s, errors 0% | -0.1 | 1 | 1 (restart) | ✅ |
| 10-23 13:38:32 | 1 pod(s), 103 rps, p95 0.98 s, errors 0% | 16.6 | 2 | 2 (scale 1->2) | ✅ |
| 10-23 13:45:34 | 2 pod(s), 171 rps, p95 0.25 s, errors 0% | 21.1 | 3 | 3 (scale 2->3) | ✅ |
| 10-23 13:55:04 | 3 pod(s), 111 rps, p95 0.08 s, errors 0% | -27.4 | 2 | 2 (scale 3->2) | ✅ |
| 10-23 14:01:51 | 2 pod(s), 67 rps, p95 0.08 s, errors 0% | -15.7 | 1 | 1 (scale 2->1) | ✅ |
| 10-23 14:40:17 | 1 pod(s), 57 rps, p95 4.60 s, errors 48% | -1.5 | 1 | 1 (restart) | ✅ |
| 10-23 16:06:54 | 1 pod(s), 57 rps, p95 0.31 s, errors 0% | 0.1 | 1 | 1 (no action) | ✅ |
| 10-23 16:08:25 | 1 pod(s), 57 rps, p95 1.83 s, errors 5% | -0.7 | 1 | 1 (restart) | ✅ |
| 10-23 18:02:44 | 1 pod(s), 101 rps, p95 0.24 s, errors 0% | 21.2 | 2 | 2 (scale 1->2) | ✅ |
| 10-23 18:10:10 | 2 pod(s), 172 rps, p95 0.25 s, errors 0% | 21.2 | 3 | 3 (scale 2->3) | ✅ |
| 10-23 18:19:33 | 3 pod(s), 113 rps, p95 0.09 s, errors 0% | -25.8 | 2 | 2 (scale 3->2) | ✅ |
| 10-23 18:26:27 | 2 pod(s), 65 rps, p95 0.08 s, errors 0% | -15.6 | 1 | 1 (scale 2->1) | ✅ |
| 10-23 18:54:29 | 1 pod(s), 57 rps, p95 4.61 s, errors 64% | -0.8 | 1 | 1 (restart) | ✅ |
| 10-23 19:47:12 | 1 pod(s), 88 rps, p95 0.19 s, errors 0% | 20.0 | 2 | 2 (scale 1->2) | ✅ |
| 10-23 19:54:04 | 2 pod(s), 150 rps, p95 0.27 s, errors 0% | 21.3 | 3 | 3 (scale 2->3) | ✅ |
| 10-23 20:04:40 | 3 pod(s), 112 rps, p95 0.08 s, errors 0% | -26.3 | 2 | 2 (scale 3->2) | ✅ |
| 10-23 20:11:19 | 2 pod(s), 67 rps, p95 0.08 s, errors 0% | -15.5 | 1 | 1 (scale 2->1) | ✅ |
| 10-23 20:35:13 | 1 pod(s), 105 rps, p95 0.42 s, errors 0% | 20.4 | 2 | 2 (scale 1->2) | ✅ |
| 10-23 20:42:30 | 2 pod(s), 172 rps, p95 0.25 s, errors 0% | 20.7 | 3 | 3 (scale 2->3) | ✅ |
| 10-23 20:51:57 | 3 pod(s), 113 rps, p95 0.07 s, errors 0% | -25.9 | 2 | 2 (scale 3->2) | ✅ |
| 10-23 20:58:38 | 2 pod(s), 67 rps, p95 0.08 s, errors 0% | -15.6 | 1 | 1 (scale 2->1) | ✅ |

Agree: 24/24.

## Acceptance (A28 / A30, criteria 2-5)

- PASS: 2. validation 2026-10-23: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-23: 4/4 anomaly phases woken
- PASS: 2. validation 2026-10-26: 0 false wake-ups in normal phases
- PASS: 2. validation 2026-10-26: 4/4 anomaly phases woken
- PASS: 3. campaign: a wake-up after every fault
- PASS: 3. campaign: false wake-ups <= 1
- **FAIL**: 3. campaign: normal load, first wake-up not later than the recorded agent's
- PASS: 4. verification: STABLE for all 23 actions
- PASS: 5. minimum pod count agrees with the right action at all 24 wake-ups
