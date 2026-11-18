# Καμπάνια memory-tests-2026-11-18

*Αναφορά από `campaign_report.py`, 2026-11-18 14:30.*

## Προέλευση

- Κώδικας, μοντέλο και φορτίο αμετάβλητα από την αρχή ως τώρα: ναι (ίδια sha256)

## Έλυσε ο agent κάθε σενάριο;

| Σενάριο | Σωστή ενέργεια | Runs | Σωστά στην 1η αφύπνιση (μετά το fault) | Ανέκαμψε | Μέσος χρόνος ανάκαμψης (s) | Σημειώσεις |
|---|---|---|---|---|---|---|
| Κανονικό φορτίο | 1→2→3→2→1 | 2 | 1/2 | 1/2 | – | μη STABLE ενέργεια, ξαναξύπνημα |
| Stuck | restart | 2 | 2/2 | 2/2 | 105 | – |

## Κανονικό φορτίο

| Μέθοδος | Runs | Παραβίαση NFR (s) | Σφάλματα (%) | replica-min | Σωστή προμήθεια (%) | Αλλαγές pods | Liveness restarts |
|---|---|---|---|---|---|---|---|
| llm-v14-memtest | 2 | 160 / 170 | 0.09 / 0.09 | 73.2 / 71.0 | 84.6 / 86.7 | 06:40 1->2, 15:50 2->3, 25:20 3->2, 32:10 2->1 ‖ 08:40 1->2, 16:00 2->3, 25:20 3->2, 32:10 2->1 | 0 / 0 |

## Stuck

| Μέθοδος | Runs | Ανάκαμψη (s) | Παραβίαση NFR μετά το fault (s) | Σφάλματα (%) | Max pods | replica-min | Liveness restarts | Ενέργειες |
|---|---|---|---|---|---|---|---|---|
| llm-v14-memtest | 2 | 110 / 100 | 90 / 90 | 5.41 / 4.64 | 1 / 1 | 16.2 / 16.2 | 0 / 0 | 12:32 restart (STABLE) ‖ 12:50 restart (STABLE) |

## Τα runs του agent ένα ένα

### Κανονικό φορτίο, 2026-11-18 13:10:52 (`4-load-testing/eval_llm_20261118_1308`)

Σωστά στην 1η αφύπνιση μετά το fault: **όχι** · ανέκαμψε: **όχι** · φραγμοί: evidence 0, diagnosis 0, claim 0

- 13:26:30 αφύπνιση χωρίς γραμμή στο incident_log: ο agent έτρεχε ακόμα στο τέλος του run (0 προειδοποιήσεις [LLM] στο controller.log μετά από αυτήν)
- 13:17:23 `Pods:1 | Load:62rps (62/pod) | P95:1.74s | Errors:7.0%` → **scale 1->2** (UNSTABLE: not improving (score -5.29 -> -4.95 over the last 30 s)); LLM calls 2, retries 0, fallback 0, fenced 1, agent 4.1 s, σύνολο 60.2 s
  - «Root cause: The service was struggling with performance (high latency and errors) while the rising traffic trend required an increase in capacity beyond the current 1 pod. Action: Scaled the deployment to 2 replicas to a»
- 13:18:33 `Pods:2 | Load:87rps (43/pod) | P95:1.33s | Errors:0.0%` → **restart** (STABLE); LLM calls 4, retries 0, fallback 0, agent 7.2 s, σύνολο 36.3 s
  - «Root cause: One pod was suffering from high latency and CPU throttling caused by a runaway background job 'rebuild-search-index' that had been running for over 10 minutes. Action: Performed a rolling restart of the deplo»
- 13:26:31 `Pods:2 | Load:171rps (86/pod) | P95:0.30s | Errors:0.0%` → **scale 2->3** (STABLE); LLM calls 2, retries 0, fallback 0, agent 7.9 s, σύνολο 27.9 s
  - «Root cause: The service was under-provisioned, as the current load of 171.2 rps exceeded the 162.1 rps capacity of 2 pods and was trending upwards. Action: Scaled the deployment to 3 replicas to accommodate the increasin»
- 13:36:00 `Pods:3 | Load:114rps (38/pod) | P95:0.08s | Errors:0.0%` → **scale 3->2** (STABLE); LLM calls 2, retries 0, fallback 0, agent 2.5 s, σύνολο 22.6 s
  - «Root cause: The service was over-provisioned with 3 pods for the current load of 113.6 rps, which is below the minimum healthy threshold of 123.3 rps. Action: Scaled the deployment down to 2 replicas to improve cost effi»
- 13:42:54 `Pods:2 | Load:65rps (33/pod) | P95:0.08s | Errors:0.0%` → **scale 2->1** (STABLE); LLM calls 2, retries 0, fallback 0, agent 2.4 s, σύνολο 22.4 s
  - «Root cause: The service was over-provisioned with 2 pods for the current load of 65.5 rps, which is below the health model's minimum threshold of 73.5 rps for 2 pods. Action: Scaled the deployment to 1 replica to meet co»

### Κανονικό φορτίο, 2026-11-18 13:51:52 (`4-load-testing/eval_llm_20261118_1349`)

Σωστά στην 1η αφύπνιση μετά το fault: **ναι** · ανέκαμψε: **ναι** · φραγμοί: evidence 0, diagnosis 0, claim 0

- 13:58:22 `Pods:1 | Load:64rps (64/pod) | P95:2.00s | Errors:2.6%` → **restart** (STABLE); LLM calls 4, retries 0, fallback 0, agent 12.5 s, σύνολο 52.7 s
  - «Root cause: A runaway background job 'rebuild-search-index' caused high event-loop lag and latency spikes. Action: Performed a rolling restart of the deployment to clear the stuck process and restore healthy service stat»
- 14:00:15 `Pods:1 | Load:101rps (101/pod) | P95:0.43s | Errors:0.0%` → **scale 1->2** (STABLE); LLM calls 2, retries 0, fallback 0, agent 23.0 s, σύνολο 43.1 s
  - «Root cause: The service was under-provisioned, as the load of 100.5 rps exceeded the 87.3 rps capacity of a single pod. Action: Scaled the deployment to 2 replicas to accommodate current and projected traffic.»
- 14:07:40 `Pods:2 | Load:170rps (85/pod) | P95:0.23s | Errors:0.0%` → **scale 2->3** (STABLE); LLM calls 2, retries 0, fallback 0, agent 9.8 s, σύνολο 29.9 s
  - «Root cause: The service was under-provisioned, as the load of 170.1 rps exceeded the 162.1 rps healthy capacity of 2 pods. Action: Scaled the deployment to 3 replicas to accommodate the traffic and restore health.»
- 14:17:01 `Pods:3 | Load:114rps (38/pod) | P95:0.09s | Errors:0.0%` → **scale 3->2** (STABLE); LLM calls 2, retries 0, fallback 0, agent 6.7 s, σύνολο 26.8 s
  - «Root cause: The service was over-provisioned with 3 pods for the current load of 113.5 rps, which is below the minimum healthy threshold of 123.3 rps for 3 pods. Action: Scaled the deployment down to 2 replicas to improv»
- 14:23:49 `Pods:2 | Load:68rps (34/pod) | P95:0.08s | Errors:0.0%` → **scale 2->1** (STABLE); LLM calls 2, retries 0, fallback 0, agent 9.9 s, σύνολο 30.0 s
  - «Root cause: The service was over-provisioned with 2 pods, as the load of 68.2 rps was below the healthy minimum of 73.5 rps for 2 pods. Action: Scaled the deployment to 1 replica to meet cost objectives and maintain heal»

### Stuck, 2026-11-18 12:27:26 (`4-load-testing/eval_stuck_llm_20261118_1225`)

Σωστά στην 1η αφύπνιση μετά το fault: **ναι** · ανέκαμψε: **ναι** · φραγμοί: evidence 0, diagnosis 0, claim 0

- 12:32:06 `Pods:1 | Load:57rps (57/pod) | P95:4.61s | Errors:66.2%` → **restart** (STABLE); LLM calls 4, retries 0, fallback 0, agent 52.8 s, σύνολο 72.9 s
  - «Root cause: The backend pod suffered from a DB connection pool exhaustion (all 10 connections busy, 0 idle), causing 5xx errors and preventing the service from being ready. Action: Triggered a rolling restart of the depl»

### Stuck, 2026-11-18 12:46:23 (`4-load-testing/eval_stuck_llm_20261118_1244`)

Σωστά στην 1η αφύπνιση μετά το fault: **ναι** · ανέκαμψε: **ναι** · φραγμοί: evidence 0, diagnosis 0, claim 0

- 12:50:53 `Pods:1 | Load:57rps (57/pod) | P95:4.60s | Errors:50.8%` → **restart** (STABLE); LLM calls 4, retries 0, fallback 0, agent 12.7 s, σύνολο 32.8 s
  - «Root cause: The backend pod suffered from a DB connection pool exhaustion (all 10 connections busy, 0 idle), causing 5xx errors and preventing the service from being ready. Action: Triggered a rolling restart of the depl»

## Τι να κοιτάξεις

- Κανονικό φορτίο 2026-11-18 13:10:52: σωστό στην 1η αφύπνιση False, ανέκαμψε False, ξαναξύπνημα, μη STABLE ενέργεια (`4-load-testing/eval_llm_20261118_1308`)

Όλοι οι πίνακες με μέσους όρους και τα στατιστικά: `4-load-testing/comparison_nfr.md`.
