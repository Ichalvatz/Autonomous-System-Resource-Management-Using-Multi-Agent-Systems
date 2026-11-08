# Prompt evaluation: v13's prompt against v14's (A33)

*Closed on 2026-11-08 (A34): the runs measured the prompts with v13's three observation tools; v14's investigation then became two tools (the data and the logs), so the runs still planned were not made.*

*`prompt_eval.py --report`, 2026-11-08 12:06. 43 recorded wake-ups (1-3/11, the current health model), 236 runs with gemini/gemini-3.1-flash-lite; 202 used only the primary model and are counted (34 used the fallback or failed).*

*7 earlier runs are superseded and not counted: 5 × input fixed 2026-11-04: its recorded get_pod_breakdown output was a failed step's error; 2 × v14 run before the fence repair also covered a Thoughts line with unfenced code (2026-11-04 12:30).*

*Runs per case differ (A33, 2026-11-05): Gemini's free tier allows 500 requests a day, so after 4/11 only the 17 cases that call for an investigation got more runs (v14 up to 3); the capacity cases were settled (v13 41/41, v14 36/36 right) and v13 keeps its 1-3 runs per case. The criteria therefore weigh each case the same (rate = mean over cases; steps = median of the per-case medians).*

*v14-draft1: the first draft of v14's prompt (reasoning as comments inside the code block), stopped after its runs lost steps to unfenced code; v14 is the prompt as fixed (a "Thoughts:" line, then the block). Its column is for reference.*

## Summary (pooled runs)

| | v13 prompt | v14 prompt | v14-draft1 prompt |
|---|---|---|---|
| Right action, capacity cases (scale) | 41/41 | 36/36 | 44/44 |
| Right action, restart cases | 17/17 | 15/16 | 20/20 |
| Right action, no-action cases | 6/10 | 6/10 | 6/8 |
| Code-format failures (steps) | 5 | 1 | 19 |
| Bare-code replies fenced by code (not failures) | 0 | 1 | n/a |
| Guard refusals (steps) | 1 | 5 | 3 |
| Median seconds per run | 11.7 | 19.05 | 8.55 |
| Runs / LLM calls | 68 / 244 | 62 / 215 | 72 / 245 |

Per case (42 cases with runs of both): right-action rate v13 94.0%, v14 94.0%; steps v13 2, v14 2.

## Criteria (declared before the first run)

- 1. right-action rate at least v13's (per case): **pass**
- 2. no code-format failure: **FAIL**
- 3. median steps not above v13's (per case): **pass**
- 4. no wrong restart v13 never made: **pass**

*The lag check (v14-lag, A33: v14 with get_pod_breakdown's healthy event-loop lag reference, on the investigation cases) was declared on 4/11 and never ran: the evaluation closed on 8/11 when the investigation tools changed (A34). The reference is judged in the live runs.*

## Every case

| Case | Expected (why) | At the time | v13 prompt | v14 prompt | Borrowed outputs |
|---|---|---|---|---|---|
| eval_cpuhog_llm_20261101_1732@17:39:13 | restart (cpuhog, after the fault) | restart | restart, restart | restart, restart | 0 |
| eval_cpuhog_llm_20261101_1951@19:58:33 | restart (cpuhog, after the fault) | restart | restart, restart | restart, restart | 0 |
| eval_cpuhog_llm_20261101_1951@20:04:21 | none (minimum 1 = current 1) | none | none, none | none, none | 0 |
| eval_cpuhog_llm_20261101_1951@20:08:14 | none (minimum 1 = current 1) | none | none, none | none, none | 0 |
| eval_cpuhog_llm_20261101_2247@22:53:53 | restart (cpuhog, after the fault) | restart | restart, restart | restart, restart | 0 |
| eval_cpuhog_llm_20261102_0247@02:54:51 | restart (cpuhog, after the fault) | restart | restart, restart | restart, none ✗ | 0 |
| eval_cpuhog_llm_20261102_0542@05:49:40 | restart (cpuhog, after the fault) | restart | restart, restart | restart, restart | 0 |
| eval_llm_20261101_1754@18:04:50 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2, scale 2 | scale 2, scale 2 | 0 |
| eval_llm_20261101_1754@18:12:18 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3, scale 3 | scale 3, scale 3 | 0 |
| eval_llm_20261101_1754@18:21:57 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2, scale 2 | scale 2, scale 2 | 0 |
| eval_llm_20261101_1754@18:28:42 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1, scale 1 | scale 1, scale 1 | 0 |
| eval_llm_20261101_2035@20:46:11 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2, scale 2 | scale 2, scale 2 | 3 |
| eval_llm_20261101_2035@20:52:32 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3, scale 3 | scale 3, scale 3 | 0 |
| eval_llm_20261101_2035@20:56:14 | none (minimum 3 = current 3) | none | restart ✗, none | restart ✗, restart ✗ | 0 |
| eval_llm_20261101_2035@20:57:26 | none (minimum 3 = current 3) | restart | restart ✗, restart ✗ | restart ✗, restart ✗ | 0 |
| eval_llm_20261101_2035@21:03:22 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2 | scale 2, scale 2 | 3 |
| eval_llm_20261101_2035@21:09:57 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1 | scale 1, scale 1 | 3 |
| eval_llm_20261101_2330@23:40:35 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2 | scale 2 | 0 |
| eval_llm_20261101_2330@23:48:47 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3, scale 3 | scale 3 | 0 |
| eval_llm_20261101_2330@23:58:18 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2 | scale 2, scale 2 | 0 |
| eval_llm_20261101_2330@00:04:54 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1, scale 1 | scale 1, scale 1 | 0 |
| eval_llm_20261102_0331@03:42:01 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2 | scale 2 | 0 |
| eval_llm_20261102_0331@03:49:40 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3 | scale 3 | 0 |
| eval_llm_20261102_0331@03:59:07 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2 | scale 2 | 0 |
| eval_llm_20261102_0331@04:05:44 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1, scale 1 | scale 1 | 0 |
| eval_llm_20261102_0604@06:14:14 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2, scale 2 | scale 2 | 0 |
| eval_llm_20261102_0604@06:22:38 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3, scale 3 | scale 3 | 0 |
| eval_llm_20261102_0604@06:32:03 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2 | scale 2 | 0 |
| eval_llm_20261102_0604@06:38:46 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1, scale 1 | scale 1 | 0 |
| eval_llm_20261103_1854@19:04:28 | scale 2 (capacity: minimum 2, current 1) | scale 1->2 | scale 2, scale 2 | scale 2 | 0 |
| eval_llm_20261103_1854@19:12:10 | scale 3 (capacity: minimum 3, current 2) | scale 2->3 | scale 3, scale 3 | scale 3 | 0 |
| eval_llm_20261103_1854@19:21:48 | scale 2 (capacity: minimum 2, current 3) | scale 3->2 | scale 2, scale 2 | scale 2 | 0 |
| eval_llm_20261103_1854@19:28:30 | scale 1 (capacity: minimum 1, current 2) | scale 2->1 | scale 1 | scale 1 | 0 |
| eval_stuck_llm_20261101_1710@17:17:16 | restart (stuck, after the fault) | restart | restart, restart | restart | 0 |
| eval_stuck_llm_20261101_1907@19:14:49 | restart (stuck, after the fault) | restart | - | restart | 0 |
| eval_stuck_llm_20261101_2203@22:10:21 | restart (stuck, after the fault) | restart | restart, restart | restart | 0 |
| eval_stuck_llm_20261102_0120@01:26:56 | restart (stuck, after the fault) | restart | restart | restart | 0 |
| eval_stuck_llm_20261102_0437@04:43:53 | restart (stuck, after the fault) | restart | restart | restart | 0 |
| eval_stuck_llm_20261103_1938@19:45:18 | restart (stuck, after the fault) | restart | restart | restart | 0 |
| unstable_test_2026-11-01@16:51:20 | scale 3 (UNSTABLE test, by hand) | scale 1->3 | scale 3 | scale 3 | 3 |
| unstable_test_2026-11-01@16:52:35 | none (UNSTABLE test, by hand) | restart | restart ✗ | none | 0 |
| unstable_test_2026-11-01@16:55:12 | none (UNSTABLE test, by hand) | none | none | none | 0 |
| unstable_test_2026-11-01@16:58:26 | scale 1 (UNSTABLE test, by hand) | scale 3->1 | scale 1 | scale 1 | 3 |

Left out: unstable_test_2026-11-01@16:50:32 (left out: the 1 m window showed 61 rps of an actual 280 and the pod was not ready)

## The replies that failed the code format (v14)

- v14 unstable_test_2026-11-01@16:52:35 (rep 1): `Thoughts: The logs show high latency related to CPU throttling, and the pod breakdown confirms that pods are heavily throttled and one is failing readiness due to extremely high event-loop lag (4.86s). There are no application-level error lines (only latency warnings), and repeated restarts haven't solved the issue. Since the load is 279 rps and the healthy max for 3 pods is 251.3 rps, the system is under-provisioned. Even though 3 is the current maximum, the persistent readiness failure and lat || Error in code parsing: / Your code snippet is invalid, because the regex pattern ```python(.*?)````

## The wrong runs

- v13 eval_llm_20261101_2035@20:56:14 (rep 1): expected none, got restart; 5 steps. Answer: Root cause: One pod (jc7pn) exhibited elevated event-loop lag (0.32s) and throttling, likely contributing to the high aggregate p95 latency despite the load being within capacity. Action: Triggered a rolling restart to c
- v13 eval_llm_20261101_2035@20:57:26 (rep 1): expected none, got restart; 5 steps. Answer: Root cause: One of the pods exhibited high event-loop lag (0.40s) compared to its peers, suggesting an internal process issue despite the absence of explicit error logs. Action: Triggered a rolling restart of the deploym
- v13 unstable_test_2026-11-01@16:52:35 (rep 1): expected none, got restart; 5 steps. Answer: Root cause: The system is under-provisioned (279 rps vs capacity of 255 rps for 3 pods) leading to CPU throttling and high latency. Action: Triggered a rolling restart to attempt to clear internal bad states, though capa
- v13 eval_llm_20261101_2035@20:57:26 (rep 2): expected none, got restart; 5 steps. Answer: Root cause: One pod (aiops-backend-deployment-5476789b6f-jc7pn) exhibited significantly higher event-loop lag (0.40s vs <0.15s) compared to other pods, indicating an internal process state issue. Action: Performed a roll
- v14 eval_llm_20261101_2035@20:56:14 (rep 1): expected none, got restart; 5 steps. Answer: Root cause: One pod (aiops-backend-deployment-5476789b6f-jc7pn) exhibited significantly higher event-loop lag and CPU throttling compared to peers, indicating a localized bad state within the process. Action: Performed a
- v14 eval_llm_20261101_2035@20:57:26 (rep 1): expected none, got restart; 5 steps. Answer: Root cause: Pod aiops-backend-deployment-5476789b6f-jc7pn exhibited high event-loop lag (p99 0.40 s) compared to its peers, causing elevated latency despite no capacity issues or deployment changes. Action: Triggered a r
- v14 eval_cpuhog_llm_20261102_0247@02:54:51 (rep 2): expected restart, got none; 4 steps. Answer: No action taken: the latency breach was transient and the service is currently healthy with all metrics within objectives.
- v14 eval_llm_20261101_2035@20:56:14 (rep 2): expected none, got restart; 5 steps. Answer: Root cause: One pod (aiops-backend-deployment-5476789b6f-jc7pn) exhibited degraded performance with high event-loop lag and CPU throttling, indicative of an internal process state issue. Action: Triggered a rolling resta
- v14 eval_llm_20261101_2035@20:57:26 (rep 2): expected none, got restart; 6 steps. Answer: Root cause: One pod was exhibiting high event-loop lag (p99 0.40s) indicative of a degraded internal process state, causing the observed p95 latency spike. Action: Performed a rolling restart of the deployment to clear t
