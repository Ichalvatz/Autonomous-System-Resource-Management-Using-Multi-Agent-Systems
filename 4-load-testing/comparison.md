# Scaling strategy comparison (baseline.js, 5→20→30→14→5 VUs)

Generated 2026-10-01 14:33 from `evaluation_results.csv` (13 runs).

| Metric | static-1 (n=1) | static-3 (n=1) | hpa (n=2) | rules (n=2) | llm-v3 (n=3) | llm (n=2) | llm-agent-v1 (n=1) | llm-agent-v2 (n=1) |
|---|---|---|---|---|---|---|---|---|
| SLO violation (s, p95 > 0.35 s) | 550 | 0 | 0 ± 0 | 0 ± 0 | 0 ± 0 | 0 ± 0 | 0 | 0 |
| Pressure (s, CPU > 0.75 or throttling > 5%) | 1540 | 0 | 260 ± 1.3e+02 | 120 ± 0 | 393 ± 45 | 195 ± 21 | 240 | 240 |
| p95 mean (s) | 0.284 | 0.109 | 0.11 ± 0.0049 | 0.111 ± 0.0049 | 0.109 ± 0.0021 | 0.114 ± 0.0021 | 0.138 | 0.129 |
| Replica-minutes (cost) | 38.2 | 114.5 | 79.5 ± 0.28 | 78.2 ± 0.071 | 71.6 ± 0.17 | 71.5 ± 0 | 68.8 | 74 |
| Correct provisioning (%) | 39.1 | 22.3 | 68.8 ± 0.64 | 77 ± 0.35 | 85.9 ± 0.98 | 85.2 ± 1.9 | 83.3 | 86.6 |
| Under-provisioned (s) | 1370 | 0 | 55 ± 7.1 | 0 ± 0 | 103 ± 15 | 110 ± 28 | 120 | 20 |
| Over-provisioned (s) | 0 | 1740 | 645 ± 21 | 515 ± 7.1 | 213 ± 5.8 | 220 ± 14 | 230 | 280 |
| Scale actions | 0 | 0 | 4 ± 0 | 4 ± 0 | 4 ± 0 | 4 ± 0 | 4 | 4 |
| LLM calls | – | – | – | – | 9 ± 1.7 | 8.5 ± 0.71 | – | 8 |

Lower is better except correct provisioning. `llm` rows with notes mentioning an older agent version are
kept for history; see the notes column in the CSV.

# Stuck-dependency fault (fault_load.js, 8 VUs; POST /chaos/stuck at t = 4 min)

14 runs from `evaluation_results_stuck.csv`. Only a restart fixes the fault; adding replicas dilutes it.

| Metric | static-1 (n=1) | hpa (n=2) | rules (n=2) | llm-v3 (n=3) | llm-nomem (n=2) | llm (n=4) |
|---|---|---|---|---|---|---|
| Recovery after fault (s; p95 < 0.35 s held 60 s) | never (1/1) | never (2/2) | never (2/2) | 270 ± 2.9e+02 | 100 ± 0 | 100 ± 8.2 |
| SLO violation after fault (s) | 710 | 710 ± 0 | 710 ± 0 | 250 ± 2.9e+02 | 80 ± 0 | 82.5 ± 5 |
| Max replicas after fault | 1 | 1 ± 0 | 3 ± 0 | 1.67 ± 1.2 | 1 ± 0 | 1 ± 0 |
| Replica-minutes (cost) | 16.2 | 16.2 ± 0 | 37.4 ± 0.21 | 21.5 ± 9.1 | 16.2 ± 0 | 16.2 ± 0 |
| Scale actions | 0 | 0 ± 0 | 4 ± 0 | 1.67 ± 2.9 | 0 ± 0 | 0 ± 0 |
| Agent incidents | – | – | – | 2 ± 1.7 | 1 ± 0 | 1 ± 0 |
| Verified STABLE | – | – | – | 0.333 ± 0.58 | 1 ± 0 | 1 ± 0 |
| LLM calls | – | – | – | 7.33 ± 6.7 | 2.5 ± 0.71 | 2.75 ± 0.5 |
