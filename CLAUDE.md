# CLAUDE.md

Thesis project: **autonomous resource management of a Kubernetes workload using an LLM agent (AIOps)**.
A monitor runs one One-Class SVM per replica count on Prometheus metrics (it replaced the Isolation Forest on 2026-09-30, see "Model choice"). When it flags an anomaly, it wakes an LLM "SRE agent"
(smolagents `CodeAgent` + Gemini via LiteLLM). The agent reasons over the metrics, a measured capacity table and
past incidents stored in ChromaDB, then scales or restarts the backend deployment.

## Layout (numbered folders = pipeline order)

| Folder | What it is |
|---|---|
| `1-infrastructure/` | kind cluster config (ports 80/443), kube-prometheus-stack Helm values, ServiceMonitor for backend `/metrics`, ingresses, ChromaDB deployment+PVC |
| `2-target-app/` | The **system under management**: "myWorld Travel" app, reused from a Software Engineering II course project. `software-backend/` (Node 18 / Express, in-memory DB by default, bcryptjs login, prom-client metrics, `/chaos/zombie`, `POST /chaos/stuck` and `POST /chaos/cpuhog` endpoints) and `software-frontend/` (React + Vite, served by nginx). The k8s manifests sit at this folder's top level. |
| `3-ai-agent/` | The AIOps runtime: `anomaly_detector.py` (main loop) → `agent.py` (prompt + CodeAgent) → `agent_tools.py` (tools with safety guards) |
| `4-load-testing/` | k6 scenarios: `baseline_eval.js` (38 min, the measured demo used by `run_experiment.sh`: 5→20→30→14→5 VUs on `/auth/login`, which should drive 1→2→3→2→1 replicas; the 3→2 step is 14 VUs, not 18, because 18 sits inside the 3-replica band), `baseline.js` (the same shape cut to 22 min on 2026-10-01 22:29 for hand demos; not comparable with measured runs), `zombie_background.js` / `zombie_test.js` (chaos injection), `detector_validation.{js,sh}` + `analyze_validation.py` (scripted detector test, see "Detector validation"), `fault_load.js` (8 VUs, 16 min, for the stuck and cpuhog faults), `run_experiment.sh` / `queue.sh` / `evaluate_run.py` / `compare_results.py` (strategy comparison, see "Evaluation harness") |
| `5-ml-training/` | Offline ML pipeline + artifacts (see below) |
| root | `deploy.sh` (full cluster bootstrap), `reset_chroma.py` (wipe `sre_runbooks` collection), `stress_profiler.py` (earlier breaking-point profiler) |

## Hostnames (ingress, need `/etc/hosts` → 127.0.0.1)
`mwtback.aiops` (backend :3001), `myworldtravel.aiops` (frontend), `chromadb.aiops` (ChromaDB :8000), `prometheus.aiops`, `grafana.aiops`.
All Python code talks to Prometheus/ChromaDB through these hostnames. Nothing uses port-forwards.

## The 5-metric feature contract
Everything shares the same PromQL for these features: `avg_cpu_per_pod`, `throughput`, `latency_p95`, `active_replicas`, `cpu_throttling` (a ratio from 0 to 1).
The queries are **copy-pasted** in `anomaly_detector.py`, `agent_tools.verify_metrics_stabilization`, `capacity_discovery.py`,
`collect_healthy_data.py` and `stress_profiler.py`. If you change one, change all of them.
The model uses 4 of them, `["avg_cpu_per_pod","latency_p95","cpu_throttling","throughput"]`; `active_replicas` selects which per-replica model scores the reading. The feature list is stored in the model bundle and the detector reads it from there.

## ML pipeline (`5-ml-training/`)
Run the three steps in order, with the detector **off** and **no** k6 traffic: each script generates its own load. Keep Docker's CPU allocation fixed across runs, and run `reset_chroma.py` after retraining.
1. `capacity_discovery.py`: for replicas 1–3 (capped, see "Pod sizing"), ramps Python-thread VUs (1 req/s each, POST /auth/login) in steps of 2 until CPU > 0.75, throttle > 8% or p95 > 1 s. Each ramp starts at the previous count's safe VUs. A breaking reading only counts if a re-measurement at the same load also breaks. Writes `capacity_table.json` and `capacity_discovery_log.csv`. Takes about 30–45 min for 3 replicas.
2. `collect_healthy_data.py`: for each replica count, a continuous ramp (+1 VU every 30 s, a reading every 15 s) from the bottom of that count's band up to its safe VUs and back down. Bands: 1 replica starts at 1 VU (with 6 readings per VU at 1–3 VUs, where p95 is noisy); N replicas start at `OVERLAP` = 70% of (N−1)'s safe VUs, which gives 1–12, 8–24 and 17–32 VUs. The overlap is an anti-flapping deadband: N−1 scales up above its safe max, N scales down only below 70% of it. Writes `baseline_metrics_healthy.csv` (with a `vus` column). Takes about 55 min, about 200 readings.
3. `train_health_baseline.py`: filters to SLO-healthy rows: CPU ≤ 0.95, throttling < 10%, and p95 < 0.35 s, which is the agent's own SLO, so the model never learns as healthy a state the agent treats as a violation. No transition filter: the collector waits for readiness + 60 s. Fits **one One-Class SVM per replica count** on 4 features:
   - `log(cpu)`, `log(throughput)` → StandardScaler (clipped at 0.001)
   - latency: `log(max(p95, 0.2)) × 4`, fixed scale
   - throttling: `max(ratio, 0.05) × 20`, fixed scale
   - → `OneClassSVM(rbf, nu=0.02, gamma=0.02)`

   Runs probes derived from the measured bands: HEALTHY mid-band, WASTE (0.8× the band bottom), AFTER scale-down (the smaller count must see that load as normal: no flapping), OVERLOAD, STUCK (p95 = 5 s), p95 = 0.19 s (healthy top, must be normal), SLOW p95 = 0.4 s (must be an anomaly) and LOW traffic. Prints a held-out false-alarm estimate (train on ramp-up, test on ramp-down and back; pessimistic, about 2× the real rate). Writes `health_model.pkl` (a dict `{"model_type", "features", "models": {1: …, 2: …, 3: …}}`) and `*_filtered.csv`.
- `train.py` and `save.py` (the first Isolation Forest scripts) were deleted on 2026-09-30.
- `*.pkl` files are gitignored, so a fresh clone has no model. The detector loads `./5-ml-training/health_model.pkl` and refuses any other format. Both `isolation_forest_baseline.pkl` files (root: Aug 9 from `train.py`/`save.py`; `5-ml-training/`: the last Isolation Forest) are unused leftovers.

## Runtime flow
`anomaly_detector.run_monitor()` polls every 10 s. It skips a reading if any metric is missing, if `active_replicas` changed less than 90 s ago (`REPLICA_SETTLE_SECONDS`; the collector likewise waits for readiness + 60 s after a replica change, so no training reading mixes pod counts), or if throughput is below `MIN_THROUGHPUT_RPS` (0.8, just under the 1-VU training data). Otherwise it scores the reading with the model for the current `active_replicas` (a replica count with no model, e.g. 4, counts as an anomaly).
The agent is only called after `ANOMALY_STREAK_REQUIRED` (3) anomalous readings in a row. Any skip or normal reading resets the streak. The call to `agent.trigger_ai_agent(metrics_json)` blocks. Afterwards a 60 s cooldown deadline (`AGENT_COOLDOWN_SECONDS`) blocks new triggers while monitoring continues. Ctrl+C prints a summary.
`--dry-run` never imports `agent` (no LLM key needed, no cluster changes). It counts the times it would have woken the agent and logs every evaluated reading (metrics, prediction, `decision_function` score) to `5-ml-training/dry_run_readings.csv` (an existing file is moved aside with its timestamp, never overwritten). SIGTERM is handled like Ctrl+C (the experiment scripts stop controllers with SIGTERM, because background jobs of a non-interactive shell ignore SIGINT). Use it to measure the false-alarm rate on healthy traffic before running real experiments.
The agent prompt uses a 3-tier framework: SLO violation → find the bottleneck first (CPU bottleneck → scale up; high latency with low CPU → the app is stuck → check logs → restart; prompt v4, 2026-10-01: v3 made scale-up mandatory for any latency violation and the stuck-app run scaled up in 1 of 3 runs); capacity matching; scale down.
**The LLM decides and acts; code does everything around it (changed 2026-09-30).** `trigger_ai_agent` looks up the closest past incident in ChromaDB (deterministic signature string) and puts it in the prompt. The LLM's only tools are `scale_kubernetes_deployment`, `restart_kubernetes_deployment` and `get_kubernetes_logs` (returns only WARN/ERROR/5xx lines), `add_base_tools=False`, `max_steps=6`; a normal incident is 2 LLM calls (act, `final_answer` with root cause). After the run, **even if the LLM crashed after acting**, code runs `verify_metrics_stabilization` and, if STABLE, saves signature + metrics + recorded actions + the LLM's root cause to ChromaDB.
- **Verification** (changed 2026-10-01): waits until the rollout has converged (updated == available == desired replicas, observed generation current; counts alone pass too early for a restart), then 50 s more, and queries **40 s rate windows** (not the detector's 1 m), so the window covers only ~10–50 s after the action: no requests from before it and no new-pod startup burst. (The old fixed 20 s on 1 m windows mostly measured pre-action data and passed almost anything; 45 s on 1 m windows judged a successful restart UNSTABLE. 30 s windows sometimes return empty: cAdvisor can have < 2 samples.) These are the only queries that deviate from the 1 m feature contract. p95 must be < 0.35 s (since 2026-10-01 evening: a fault that more pods only dilute, e.g. p95 4.4 s → 3 s, must not count as fixed; no earlier STABLE verdict relied on the old "or improved" clause). CPU < 0.75 and throttling < 10% each pass if met **or** improved by ≥10% vs pre-action. Throttling uses the training filter's healthy limit (10%), not the agent's 5% early-warning target: a single post-action window is bursty (a restart that fixed the app read 6.7% at CPU 0.52) and the healthy training data reach 6.2% (so a scale-up during a still-rising ramp passes). About 60–70 s per incident.
- **Rollback:** if a scale-**down** is not STABLE, `agent._rollback_failed_scale_down` restores the previous count (logged as `rollback to N` in `actions`). A failed scale-up is left in place; the detector wakes the agent again.
- **Memory retrieval is metric-based, not embedding-based** (changed 2026-10-01): same replica count only, nearest by scaled distance over log rps, CPU, throttling and log p95; the top 2 go into the prompt. On 2026-09-30 text embeddings put overload and waste at nearly the same distance (0.03–0.05), so a scale-up incident was the "closest" match for a waste state. New entries store the metrics as metadata; older ones are parsed from the signature string. Since 2026-10-01 the signature also carries p95 (`| P95:3.4s`), and an incident whose p95 is unknown gets +3 distance when either side breaks the latency SLO (a stuck app had matched old overload incidents at distance < 1). If even the best match is > 3 (`MEMORY_SIMILAR_MAX`), the text says "NO similar past incident ... Do NOT reuse their actions" (a stuck app once reused a far-away "scale 3->1"). 9 entries saved by a stray detector during the invalid 00:06 HPA run were deleted on 2026-10-01 (backup: `3-ai-agent/chroma_backup_2026-10-01_1100.json`).
Why: in the first live run the LLM did verification and saving itself, and a Gemini 503 right after the 2→3 scale crashed the run, so the action was never verified or remembered.
Success is decided by `agent_tools.run_outcome`, which the tools fill in (the actions they applied and the latest verification verdict). The LLM's final text is never parsed. `save_resolution_to_chroma` refuses to save unless the verdict is STABLE.
ChromaDB is connected lazily and retried on each use (a one-shot connect at import once failed silently while ChromaDB was starting and disabled memory for a whole run).
LLM calls go through `RetryingLiteLLMModel`: transient errors (429/503/5xx/timeouts, and responses without text, which Gemini sometimes returns) retry after 5/15/30 s, then the fallback model is tried: `gemini/gemini-2.5-flash` by default since 2026-10-04 04:40 (all measured runs had no fallback; `AIOPS_FALLBACK_MODEL=<model>` or `=off`). Every agent run is appended to `3-ai-agent/incident_log.csv` (metrics, memory hit, actions, verdict, saved, error, LLM calls/retries/fallbacks, seconds): the source for MTTR and success-rate numbers.
`capacity_table.json` holds VUs (used by `collect_healthy_data.py`) and rps (`max_safe_rps` / `breaking_rps`, used in the agent prompt).
Tool guards: namespace and deployment are hard-coded (`default` / `aiops-backend-deployment`); replicas 1–3 (`MAX_REPLICAS`, host CPU limit); max ±2 replicas per call; cooldowns of 30 s (scale) and 60 s (restart), stored in module globals.
**Prompt v6 (`AIOPS_PROMPT=v6`, added and frozen 2026-10-03 14:28; v4/v5 prompts and toolsets are byte-identical to the measured ones):** the agent gets the on-call toolbox instead of a code-computed hint. 7 tools: `get_pod_breakdown` (per pod: CPU, throttling, req/s, CPU per request, p95, 5xx, event-loop lag, memory/limit, restarts, age, revision), `get_deployment_history` (recent revisions and what changed: image/env/limits/restart only), `get_kubernetes_logs`, `scale_kubernetes_deployment`, `restart_kubernetes_deployment`, `restart_kubernetes_pod` (one pod; refused if < 2 pods ready; 60 s cooldown), `rollback_kubernetes_deployment(revision=0)` (JSON-patch replace of the pod template, like `kubectl rollout undo`; 60 s cooldown). `max_steps=10`. The prompt says investigate → find the cause → act on the cause; it has no "scale up MANDATORY" (v4) and no "> 2× → restart" rule (v5); a unit test checks this. It also shows **"YOUR RECENT ACTIONS"**: every agent run of the last 15 min with its verification verdict (`agent.RECENT_ACTIONS`, in-process on purpose: a failure depends on context and expires, so it is not stored in ChromaDB). Details and freeze hashes: `NOTES_2026-10-03.md`.
**Prompt v7** (`AIOPS_PROMPT=v7`; was the default 2026-10-03 20:20–00:45, superseded by v8): v6's tools + a CLASSIFY step on code-computed facts (`agent._computed_facts`: minimum replica count from the capacity table, CPU per request as a multiple of the healthy 0.073) → (A) capacity: v4's explicit tiers incl. "you MUST scale DOWN to the minimum"; (B) anything else: v6's investigation and act on the cause; stricter "one pod misbehaving" (uneven CPU under load is normal imbalance). Two code-enforced guards at the end of `agent_tools.py`, wired via smolagents `step_callbacks` + `final_answer_checks`, active only during a v7 run (`AIOPS_ACT_GUARD=off` disables them): evidence before action (an action or final answer in the same step as an observation is refused) and no claimed action without a tool call (a final answer not starting with "No action taken" is refused while no action was recorded). Why: v6 regressed on the demo (no scale-down in 5 wake-ups, a pod restart for load imbalance, a claimed but never executed scale-up) and once pre-committed to a scale-up before seeing its own observations. Results 2026-10-03: demo 4/4 correct (72.0 replica-min, 0 s SLO violation), cpuhog restart, badconfig rollback, stuck restart (slowed by a Gemini outage). The LLM wrapper also retries answers that carry no text (Gemini sometimes returns only native tool_calls, which a CodeAgent cannot use).
**Prompt v8 = THE FINAL VERSION, DEFAULT since 2026-10-04 00:45** (v7 was the default 2026-10-03 20:20–00:45; v4–v7 stay selectable via `AIOPS_PROMPT` and byte-identical): v7 + a third code guard, *diagnosis before a disruptive action* (`agent_tools._diagnosis_refusal`: restart, pod restart and rollback are refused until all three observation tools were used in the run; scaling is not affected) + a rewritten Step 2B (check what changed first → rollback; restart only with evidence of a bad process state, not with warnings that repeat the symptom; a short SLO breach without evidence may be a transient → no action). Why: v7 badconfig run 2 restarted after looking only at the per-pod view (the cause was in the deployment history), and v7 demo run 2 restarted a healthy pod for a transient latency blip. v8 results: 6/6 scenario runs right at the first wake-up (demo ×2: 4/4 actions, 0 s SLO violation, 71.0/71.7 replica-min; cpuhog 130 s; stuck 120 s; badconfig ×2 rollback 160/110 s).

## Pod sizing: 1 core per backend pod (decided 2026-09-28)
The backend pod keeps `cpu: "1"` for both request and limit. **Don't change it** without redoing capacity discovery, data collection and training.

**Why 1 core gives correct data:**
- **It matches Node.js.** Node runs JavaScript on a single thread, so one process can't use more than about 1 core. A 1-core pod therefore measures the app's real limit, not an artificial cap.
- **It keeps the throttling metric meaningful.**
  - A login (bcrypt, cost 10) uses about 70 ms of CPU; measured: about 0.065 core-seconds per request.
  - Linux enforces CPU limits in 100 ms windows (CFS periods). With a 1-core limit, the pod may use 100 ms of CPU per window, so a single login finishes without pausing.
  - Throttling therefore only rises when requests really pile up. Measured: about 1–5% up to the safe load, rising to 5–7% near the breaking point.
  - That makes `cpu_throttling` a valid overload signal for the anomaly model and the agent.
- **Smaller pods would break that.** With 500m (50 ms per window), almost every login would be paused mid-request. That's roughly 10% throttled windows per request/second, even when the pod is nearly idle. The 8% breaking point, the 10% training filter and the agent's 5% SLO would all fire at about 1 rps, and logins would take about twice as long.
- **The CPU thresholds assume 1 core.** They are absolute (0.75 for the breaking point and the agent SLO, 0.95 for the training filter, and 1.0 in the synthetic tests). A smaller pod could never reach 0.75, so discovery would never find a breaking point.

**The cost: at most 3 useful replicas on this laptop, so the cap is applied** (`MAX_REPLICAS = 3`, `REPLICA_RANGE = [1, 2, 3]`, and `capacity_table.json` trimmed to rows 1–3; `capacity_discovery_log.csv` still holds the full 1–6 trace as evidence). The 2026-09-28 capacity run on a MacBook Air (Docker/kind has 8 CPUs, 4 of them performance cores) found:

| Replicas | Max safe load | p95 latency at that load |
|---|---|---|
| 1 | 11.1 rps | 0.10 s |
| 2 | 20.9 rps | 0.24 s |
| 3 | 27.5 rps | 0.22 s |
| 4 | 29.0 rps | 0.73 s |
| 5 | 40.6 rps | 0.94 s |

The laptop stays healthy until the backend uses about 2.3 cores in total. Beyond that, the machine is the bottleneck, not the pods:
- **More pods made it slower.** At the same 32 VUs, 3 replicas had 0.22 s p95 latency and 4 replicas had 0.30 s.
- **Pods had spare CPU while requests were slow.** At 5 replicas / 66 VUs, pods used only 0.70 of their core with 4% throttling, yet p95 latency was 0.94 s. The pods had CPU budget left but were waiting for the host to schedule them.

Data from 4 or more replicas therefore measures laptop contention, not the app, and it would teach the model that slow is normal. The agent's SLO says p95 above 0.35 s means scale up.

Running more replicas needs more host CPU (a bigger machine or a multi-node cluster), not smaller pods. Memory is oversized: pods peak at about 126 MiB against 1 GiB reserved. It could be lowered safely, but hasn't been.

## Model choice: One-Class SVM, not Isolation Forest (decided 2026-09-30)
Isolation Forest was used until 2026-09-30. It was replaced because of a structural limit, not a tuning problem.

**The limit.** An Isolation Forest cuts each feature at random values **between the min and max of the training data**. A point beyond the healthy range always falls on the same side as the edge point, so it follows the same path in every tree and gets **exactly the edge point's score**, however far out it is. The score says *that* a point is past the edge, never *how far*. Measured on the 2026-09-28 data (3-replica model): 21.9 rps +0.110, and 20, 18, 16.5, 12 and 8 rps all +0.058. Latency is the same: p95 0.2 s and 5 s scored identically.
- It only reliably flags anomalies that move **several** features at once. Overload does (CPU, throttling, latency and throughput all rise).
- It misses **one-directional drift**: over-provisioning (only CPU and throughput drop), which is the whole scale-down path, and stuck code (only latency rises).
- A single model for all replica counts is worse still: "2 pods at 15% CPU, 5 rps" is healthy 1-pod data in 4 of the 5 features, so it looks normal. Hence one model per replica count.
- Tuning doesn't help. `contamination` only moves the threshold, and points with identical scores can't be separated by any threshold. `n_estimators`, `max_samples` and `max_features` don't change the edge rule. StandardScaler has no effect on an Isolation Forest (verified: identical scores).

**The replacement.** A One-Class SVM also trains on healthy data only, but it scores by RBF distance to the healthy data (`Σ αᵢ·exp(−γ‖x−xᵢ‖²) − ρ`). Far from all healthy readings the score always falls below 0, so beyond-the-band points are flagged. `nu` plays the role of `contamination`; `gamma` sets how tight the boundary is.

**Evidence (simulated continuous-ramp data, per-replica models, 5–8 runs).**

| | Waste 40% below band | Demo scale-downs | Stuck p95 = 5 s | Healthy readings flagged |
|---|---|---|---|---|
| Isolation Forest | 2/10 | 2/10 | 1/15 | 3% |
| One-Class SVM (final config) | all | all | all | ~7% on new-day data, ~no runs of 3 in a row |

- **Log features:** load bands are ratio-wide (2 pods: 7→22 rps). In linear units a 20% shortfall below the 2-pod band was only about 0.3 std and was missed. With `log(cpu, latency, throughput)`, 0/84 probe failures.
- **`gamma`:** 0.1 memorized the training points (23% held-out false alarms in simulation). On the real data 0.02 was the best trade-off.
- **Latency and throttling floors (found on the real 2026-09-30 data, not in simulation).** Real p95 sits on histogram-bucket plateaus (~0.075 / ~0.099 / ~0.17 s), and which plateau it's on drifts over time independent of load. At 2 pods, ramp-up p95 had median 0.099 s and ramp-down 0.074 s; at 3 pods it was the opposite. Standardized per replica count, a healthy plateau switch looked like a big jump: **49.5% held-out false alarms**. Fix: every p95 under 0.2 s counts as the same value, and above that a fixed weight applies (0.4 s is clearly anomalous, 5 s is extreme). Same idea for throttling at the agent's 5% SLO. Result: 10.8% held-out (pessimistic), with all 20 probes passing.
- **Rejected:** fixed "domain" scaling (log2, latency/2, throttling/0.05) gave more false alarms. Elliptic Envelope and LOF missed waste.
- **Known limit:** early overload (CPU just above 0.75 with normal latency and throttling) can look like the top of the healthy band. Real overload in the demo (20 VUs on 1 pod, 30 on 2) saturates CPU, latency and throttling together and is caught.
- **One Isolation Forest per replica count doesn't fix it either** (tested on the real 2026-09-30 data, then replaying live validation run 2 through it). It removes the mixing problem but not the edge rule.
  - Plain: 5/20 probes failed (2-pod waste, 2-pod stuck 5 s, 2-pod slow 0.4 s, plus healthy 0.19 s flagged), and it missed live phase H (the demo's 2→1 scale-down).
  - With the latency/throttling floors: 7/20 failed, because latency became constant in training, leaving the forest no range to cut. It missed stuck and slow at every replica count, missed phase H, and woke falsely in healthy phases C and E.
  - Same data, One-Class SVM: 0/20 probes failed, and every live phase came out correct.
- The project is all-in on One-Class SVM; the Isolation Forest code was removed. The numbers above are the thesis evidence.

## Detector validation (2026-09-30, real traffic)
`4-load-testing/detector_validation.sh` (~34 min) runs k6 (`detector_validation.js`) through every state of the demo, sets the replica count by hand at each phase boundary, and runs `anomaly_detector.py --dry-run` alongside (no LLM, no agent). This tests scale-down states that a plain dry run can't reach. `python 4-load-testing/analyze_validation.py` prints one row per phase: readings, flagged, wake-ups, time to first wake-up, and SLO breaches (p95 > 0.35 s).

| Phase | State | Expected | Run 1 (busy host) | Run 2 (quiet host) |
|---|---|---|---|---|
| A | 1 pod, 5 VUs | normal | ✅ | ✅ |
| B | 1 pod, 20 VUs | overload | ✅ wake after 54 s | ✅ 53 s |
| C | 2 pods, 20 VUs | normal | ⚠️ 2 wakes, real SLO breach (p95 0.6–0.85 s) | ✅ |
| D | 2 pods, 30 VUs | overload | ✅ 25 s | ✅ 54 s (p95 still 0.145 s: caught before users feel it) |
| E | 3 pods, 30 VUs | normal | ⚠️ 1 wake, real SLO breach (p95 0.36 s) | ✅ |
| F | 3 pods, 14 VUs | waste | ✅ 77 s | ✅ 76 s |
| G | 2 pods, 14 VUs | normal (no flap) | ✅ | ✅ |
| H | 2 pods, 5 VUs | waste | ✅ 69 s | ✅ 68 s |
| I | 1 pod, 5 VUs | normal | ✅ | ✅* |

- **Result:** every overload and waste phase was caught (after 53–77 s). There was no flapping after a scale-down. In both runs, readings in "normal" phases were flagged only where p95 really exceeded 0.35 s (run 1, phase C: 13 flagged, 13 breaches). k6 reported 100% successful requests.
- *The run-2 wake-up counted in phase I came 7 s after the scale to 1. kube-state-metrics still reported 2 replicas, so that reading was still the phase-H waste state and flagging it was correct.
- **Host load matters.** Run 1 had Safari, VS Code and Bitdefender running (Docker VM at 160–215% CPU). CPU per request rose from about 0.067 to about 0.084 core-s, and 2 pods at 20 VUs really broke the SLO. For experiments, keep only Docker and VS Code open and let the laptop idle a few minutes between long runs. Report this as a threat to validity.

## Evaluation harness and baselines (added 2026-10-01)
- `4-load-testing/run_experiment.sh <strategy>`: clean reset (1 replica, or 3 for static-3, 120 s idle) → start ONE strategy → `baseline_eval.js` (38 min) → stop → score. Strategies: `llm` (detector + agent), `rules` (`3-ai-agent/rule_scaler.py`), `hpa` (`4-load-testing/baselines/hpa.yaml`, CPU 70%, 1–3, needs metrics-server), `static-1`, `static-3`. Output in `4-load-testing/eval_<strategy>_<time>/`.
- Env switches: `SCENARIO=stuck` / `SCENARIO=cpuhog` (fault runs; results in `evaluation_results_<scenario>.csv`), `AIOPS_MEMORY=off` (no memory lookup/save: RAG ablation), `LABEL=...` (result label, e.g. `llm-nomem`). Labels in the CSVs: `llm` = prompt v4 (the 2026-10-01 runs), `llm-v3` = prompt v3, `llm-v5` … `llm-v8` = those prompts, `llm-agent-v1/v2` = older flows, `*-INVALID` = excluded. Without `LABEL`, `run_experiment.sh` labels by version since 2026-10-07: `llm-<AIOPS_PROMPT>` (default `llm-v8`; plain `llm` only for v4), `rules-v2` when `RULES_RESTART=on` (before, a default-v8 run would have been filed under `llm` = v4).
- `4-load-testing/queue.sh hpa rules llm ...` runs several back to back (3 min idle between). Never run two strategies at once: each one scales the same deployment.
- `4-load-testing/evaluate_run.py` scores any window from Prometheus history (10 s step) and appends to `4-load-testing/evaluation_results.csv`: `slo_violation_s` (p95 > 0.35 s), `pressure_s` (CPU > 0.75 or throttling > 5%), p95 mean/p99, `replica_minutes` (cost), under/over-provisioned seconds and `correct_prov_pct` (vs the capacity table's safe rps), `scale_actions`, and for LLM runs incidents / STABLE / LLM calls / mean agent seconds from `incident_log.csv`.
- **Rule-based baseline** = the agent's 3 tiers hard-coded, with the same metrics, capacity table, scale tool (same guards) and gates (90 s settle, 0.8 rps gate, 3 in a row, 60 s cooldown). Scale-down below 70% of (N−1)'s safe rps (the collector's deadband). Any difference vs the LLM is the decision maker alone.
- `4-load-testing/night_run.sh [N]`: N × LLM runs with one long-lived detector (first overnight run 2026-09-30, stopped after run 1 in favour of the comparison queue).
- **Results of the 2026-10-01 overnight comparison** (`4-load-testing/OVERNIGHT_REPORT_2026-10-01.md`, `comparison.md`, `comparison_timelines.png`): every strategy except static-1 had 0 s SLO violation. LLM v3 (n=3): 71.6 replica-min, 86% correct provisioning, 393 s pressure. HPA (n=2): 79.5, 69%, 260 s. Rules (n=2): 78.2, 77%, 120 s. static-3: 114.5. static-1: 38.2 but 550 s SLO violation. So the agent is the cheapest SLO-safe strategy (−10% vs HPA, −37% vs static-3) but reacts slowest; 16/16 new-flow actions verified STABLE. The 00:06 HPA run is `hpa-INVALID` (a leftover detector also scaled).
- **Stuck-fault results (2026-10-01):** LLM prompt v4 recovered in 90–110 s (4/4, restart, STABLE; memory off: same); HPA, rules and static-1 never recovered (710 s violation); rules went to 3 pods (37.4 replica-min). Prompt v3 restarted in 2/3 runs (once scaled up first, recovery 610 s).
- `compare_results.py` also prints exact significance tests (permutation test on replica-minutes, Fisher exact on fault recovery) and, per LLM fault run, the agent's actions with their verdicts (from `incident_log.csv`). `evaluate_run.append_row` rewrites the CSV with a union header when a row brings new columns (plain appends shifted columns).
- **CPU-hog fault (blind test, added 2026-10-01 evening):** `POST /chaos/cpuhog` starts a never-ending background job that blocks the event loop 600 ms at a time with random 100–400 ms gaps (a fixed period let closed-loop VUs phase-lock into the gaps and p95 drifted under the SLO). At 8 VUs on 1 pod: CPU ~0.9, throttling ~18%, server p95 ~0.48 s, throughput drops to ~4.2 rps. It looks like overload at a third of the capacity rps; only a restart fixes it. Designed after prompt v4 was frozen; v4 was not changed for it. Queue: `4-load-testing/cpuhog_queue.sh`.
- **Cpuhog results (v4):** 2/2 runs failed: 1→2→3 for "CPU saturation", then 3→1 "over-provisioned" (UNSTABLE, rolled back) repeatedly; never read logs or restarted. Rules oscillated 1→2→3→1 and never recovered either. Cause: the app's latency histogram does not time requests queued behind a blocked event loop, so with 2 of 3 pods hogged the server p95 looks healthy (k6 sees ~0.9 s). For this fault use `cpu_recovery_s` and the k6 columns, not server-p95 `recovery_s`. Signals that separate it: CPU per request (healthy median 0.073 core-s, max 0.10; overload 0.066; cpuhog 0.21–0.33) and `nodejs_eventloop_lag_p99_seconds` (already scraped; healthy/overload ≤ 0.23 s, cpuhog 0.8–1.3 s).
- **Prompt v5** (`AIOPS_PROMPT=v5`; the default was v4 then, v8 since 2026-10-04; the v4 prompt is byte-identical to the measured one): adds a code-computed "CPU cost per request = N× healthy" section. Tested by `4-load-testing/v5_queue.sh` (label `llm-v5`: cpuhog ×2, stuck ×1, baseline ×1).
- Memory stores only verified successes, so a rolled-back failure leaves no trace and the agent repeated the same failed 3→1 three times in one run. Fixed in v6 (2026-10-03): the prompt shows "YOUR RECENT ACTIONS" with their verdicts (see Prompt v6).
- **2026-10-03 additions:** `rules-v2` = `RULES_RESTART=on python 3-ai-agent/rule_scaler.py`: the rule baseline plus the restart rules an engineer would write after seeing the two faults (R1 stuck: p95 > 0.35 s with CPU/pod < 0.5 and throttling < 5%; R2 runaway: CPU per request > 2× 0.073), checked before the scaling rules. `SCENARIO=badconfig`: at t = 4 min the harness deploys `FEATURE_LOGIN_AUDIT=true` (every login then runs a synchronous PBKDF2, 1.5M iterations: ~0.35 s CPU per login, so no replica count meets the p95 objective): a bad *configuration* change, where restarts and new pods do not help and only a rollback does; the blind test for v6 (designed after the freeze; predictions in `NOTES_2026-10-03.md`). `run_experiment.sh` removes the flag before every run. Queue: `4-load-testing/v6_queue.sh` (labels `llm-v6`, `rules-v2`; v6 fault runs use `AIOPS_MEMORY=off`).
- Unit tests: `.venv/bin/python3 -m pytest 3-ai-agent/tests -q` (74 tests: guards, verification verdicts, memory retrieval, rollback, rule decisions, v6 tools, recent actions, rules-v2 signatures, v7 facts and guards incl. two scripted CodeAgent replays; all external systems mocked).

## Running
```bash
./deploy.sh                                   # recreates kind cluster "aiops-cluster" + everything
source .venv/bin/activate                     # Python 3.13; pip install -r requirements.txt (smolagents, litellm, chromadb, kubernetes, scikit-learn, pandas, joblib)
export GEMINI_API_KEY=...                     # root .env exists but is NOT auto-loaded by the Python code
python 3-ai-agent/anomaly_detector.py --dry-run   # validate a new model first: no agent calls
python 3-ai-agent/anomaly_detector.py         # MUST run from repo root (relative model path: 5-ml-training/health_model.pkl)
k6 run 4-load-testing/baseline.js             # in another terminal
```
Backend tests: `cd 2-target-app/software-backend && npm test` (Jest, ESM). Frontend E2E: Cypress.

## Conventions / notes
- Comments and log messages mix Greek and English. That's fine; the user is Greek.
- Never read or print `.env` values (they hold HF / Gemini / OpenRouter keys).
- `THESIS_SUMMARY_EN.md` holds the research framing and a TODO list (baselines, MTTR, evaluation methodology).

## Latency histogram buckets (changed 2026-09-28)
`middleware/metrics.js` now uses fine buckets (0.025 … 0.3 s in small steps, then 0.4, 0.5, 0.75, 1, 1.5, 2 and 5 s).
The old buckets (0.05, 0.1, 0.3, …) made `latency_p95` jump from about 0.1 s to about 0.2 s as soon as a few logins took more than 100 ms. That happens often, because a login costs about 70 ms of CPU. `histogram_quantile` interpolates linearly inside the 0.1–0.3 s bucket, so the reported value doubled.
Old training data sat at exactly 0.098 s, and after standardization any small shift looked like an extreme outlier. That caused false anomalies at low traffic.
Verified after the change: with about 89% of requests under 100 ms, p95 reads 0.101 s (before, a comparable load read about 0.2 s).
Latency values in `capacity_discovery_log.csv` were measured with the old buckets. The capacity table is still valid because all breaking points for 1–3 replicas were CPU-driven. Any data collected before this change must not be mixed with new data.
After changing the backend: `docker build -t aiops-backend:latest 2-target-app/software-backend/ && kind load docker-image aiops-backend:latest --name aiops-cluster && kubectl rollout restart deployment/aiops-backend-deployment`.

## Known issues / gotchas (as of 2026-09-28)
- **Use `POST /chaos/stuck` instead of the zombie scenario** (added 2026-10-01): it puts one backend process into a "leaked DB connection pool" state (every request waits 3 s, no CPU, `[ERROR] DB connection pool exhausted` log lines) until that process restarts. New pods are healthy, so scaling dilutes but never fixes it. Inject per pod: `kubectl exec <pod> -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/stuck`. Experiment: `SCENARIO=stuck ./4-load-testing/run_experiment.sh <strategy>` (fault at t = 4 min, results in `evaluation_results_stuck.csv` with `recovery_s`).
- **The zombie scenario never reaches the agent** (the user has deprioritized it). `zombie_background.js` sends about 0.2 rps, which is below the 0.8 rps gate.
- **`/chaos/zombie` doesn't freeze the app.** It is a non-blocking `setTimeout(10s)`, so other requests are still served and the effect clears on its own. It inflates p95 but doesn't cause a real deadlock, so a restart isn't actually needed.
- **Replica metric lag:** `kube_deployment_status_replicas_available` updates a few seconds after a scale, so the first reading after a scale can still show the old count (see validation phase I).
- **`capacity_table.json` rps values are a bit low at the top.** The 2026-09-28 healthy data measured 3 replicas at 32 VUs doing 29.3 rps (CPU 0.61, p95 0.09 s), while the table says safe = 27.5 rps and breaking = 29.0 (measured before the bucket change, under more host load). The agent uses these rps values; the collector only uses the VUs.
- `MAX_SCALE_DELTA=2` can block jumps that the capacity table says are needed (e.g. 1→4).
- Ingress `rewrite-target: /` is fine: as of 2026-09-28, POST /auth/login returns a real token and Prometheus shows `route="/login"`.
- Node CPU: Docker/kind has 8 CPUs. With 6 backend replicas (1 core requested each), about 7.65 of 8 cores are requested, which fits but leaves little headroom. The host saturating at high replica counts is expected.
- Root `kind-config.yaml` (NodePort mappings) is unused. `deploy.sh` uses `1-infrastructure/kind-config.yaml`.
- Fixed 2026-10-07: the stray `2-target-app/software-frontend/agent_memory/chroma.sqlite3` is no longer tracked (local copy kept, `*.sqlite3` is gitignored), and the backend has a `.dockerignore` (`node_modules`, `coverage`), so the host's `node_modules` no longer overwrite the image's own `npm install`. All measured runs used images built before this; not rebuilt since (no extraneous host packages, so the next build should behave the same).
- Rate limiting (fixed 2026-10-03): `middleware/rateLimiter.js` has real windows again and `isAuthRateLimitEnabled()` (on unless `AUTH_RATE_LIMIT_ENABLED=false`); `backend-deployment.yaml` sets it to `false` (k6 sends every login from one IP, and in-flight requests count against the limit). Backend Jest: 802/802 pass (Jest has `bail: 1`, so the old 2 failures also hid 4–8 suites).
- `services/authService.js` has the `FEATURE_LOGIN_AUDIT` flag (off by default) used only by the badconfig experiment.
