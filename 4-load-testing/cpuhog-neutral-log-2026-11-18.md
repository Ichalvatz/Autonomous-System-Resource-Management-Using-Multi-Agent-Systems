# Καμπάνια cpuhog-neutral-log-2026-11-18

*Αναφορά από `campaign_report.py`, 2026-11-18 12:24.*

## Προέλευση

- Κώδικας, μοντέλο και φορτίο αμετάβλητα από την αρχή ως τώρα: ναι (ίδια sha256)

## Έλυσε ο agent κάθε σενάριο;

| Σενάριο | Σωστή ενέργεια | Runs | Σωστά στην 1η αφύπνιση (μετά το fault) | Ανέκαμψε | Μέσος χρόνος ανάκαμψης (s) | Σημειώσεις |
|---|---|---|---|---|---|---|
| Cpuhog | restart | 2 | 2/2 | 2/2 | 110 | – |

## Cpuhog

| Μέθοδος | Runs | Ανάκαμψη (s) | Παραβίαση NFR μετά το fault (s) | Σφάλματα (%) | Max pods | replica-min | Liveness restarts | Ενέργειες |
|---|---|---|---|---|---|---|---|---|
| llm-v14-neutrallog | 2 | 110 / 110 | 90 / 90 | 0.0 / 0.33 | 1 / 1 | 16.2 / 16.2 | 0 / 0 | 11:54 restart (STABLE) ‖ 12:13 restart (STABLE) |

## Τα runs του agent ένα ένα

### Cpuhog, 2026-11-18 11:49:30 (`4-load-testing/eval_cpuhog_llm_20261118_1147`)

Σωστά στην 1η αφύπνιση μετά το fault: **ναι** · ανέκαμψε: **ναι** · φραγμοί: evidence 0, diagnosis 0, claim 0

- 11:54:00 `Pods:1 | Load:52rps (52/pod) | P95:1.43s | Errors:0.0%` → **restart** (STABLE); LLM calls 4, retries 0, fallback 0, agent 11.3 s, σύνολο 31.3 s
  - «Root cause: A runaway background job 'rebuild-search-index' caused event-loop lag and high latency, as evidenced by logs and high event-loop lag metrics. Action: Triggered a rolling restart of the backend deployment to c»

### Cpuhog, 2026-11-18 12:08:30 (`4-load-testing/eval_cpuhog_llm_20261118_1206`)

Σωστά στην 1η αφύπνιση μετά το fault: **ναι** · ανέκαμψε: **ναι** · φραγμοί: evidence 0, diagnosis 1, claim 0

- 12:13:00 `Pods:1 | Load:56rps (56/pod) | P95:1.57s | Errors:0.0%` → **restart** (STABLE); LLM calls 5, retries 0, fallback 0, agent 43.6 s, σύνολο 63.6 s
  - «Root cause: A background job 'rebuild-search-index' became stuck, causing high event-loop lag and latency spikes. Action: Triggered a rolling restart of the deployment to clear the stuck process.»

## Τι να κοιτάξεις

- Τίποτα: κάθε run του agent πέρασε όλους τους ελέγχους.

Όλοι οι πίνακες με μέσους όρους και τα στατιστικά: `4-load-testing/comparison_nfr.md`.
