# CLAUDE.md

Thesis project: **autonomous resource management of a Kubernetes workload with an LLM agent (AIOps)**, built around the
service's **non-functional requirements (NFRs)**. A monitor scores the NFR metrics, measured at the ingress, with one
One-Class SVM. When the SVM flags an anomaly, it wakes an LLM "SRE agent" (smolagents `CodeAgent` + Gemini via LiteLLM).
The agent reads code-computed facts, a measured capacity table and similar past incidents from ChromaDB, investigates
with observation tools, and then scales or restarts the backend. Code verifies every action by following the SVM score.
The comparison is against the native Kubernetes HPA.

**Two phases.**
- **Phase 2** (since 2026-10-22, after a meeting with the supervisors): NFRs, request mix, one SVM, HPA-only comparison.
  Decisions and results: `thesis_notes/design_decisions.md` A24–A28. Log: `thesis_notes/phase2_worklog.md`. One-page
  summary of the measured v9: `thesis_notes/results_summary.md`.
  - **Agent v10 is the current code** (branch `nfr-v10`, since 2026-10-26; A28 / A28.1): a new health model (one SVM that
    alone decides, the NFRs in its data and input scale, the score read as a distance), the user's verification rule,
    the minimum pod count from the model. Replayed offline (`4-load-testing/replay_v10.md`); **not yet run live**.
  - **Agent v9** = git tag `v9-campaign` (measured code `5cf4960`, campaign-2026-10-23); its model files in
    `5-ml-training/v9/`.
- **Phase 1** is git tag `v8.1-campaign` (agent v3–v8.1, CPU-based per-replica SVMs, login-only closed-model load, rule /
  static baselines, badconfig scenario). Documented in `design_decisions.md` A1–A23,
  `thesis_notes/removed_and_archived.md` and `thesis_notes/results_summary_phase1.md`. Its data:
  `5-ml-training/phase1/`, `4-load-testing/evaluation_results*.csv`, `comparison.md`, `3-ai-agent/incident_log_phase1.csv`.

## Layout (numbered folders = pipeline order)

| Folder | What it is |
|---|---|
| `1-infrastructure/` | kind cluster config (ports 80/443), kube-prometheus-stack values, ServiceMonitors (backend `/metrics`; `ingress-metrics.yaml` for ingress-nginx :10254), ingresses, ChromaDB (pinned digest, PVC at `/data`) |
| `2-target-app/` | The **system under management**: "myWorld Travel" (from a Software Engineering II course project). `software-backend/`: Node 18 / Express, in-memory DB, bcryptjs login, prom-client metrics, `/health` (shallow), `/ready`, `POST /chaos/stuck`, `POST /chaos/cpuhog`. `software-frontend/`: React + Vite behind nginx. The k8s manifests sit at this folder's top level (`backend-deployment.yaml`: 1 core / 1 GiB, readiness and liveness probes, `SEED_DATASET=load`). |
| `3-ai-agent/` | The runtime: `anomaly_detector.py` (main loop) → `agent.py` (facts, prompt, CodeAgent, LLM retries) → `agent_tools.py` (5 tools, guards, verification, memory). Shared modules: `nfr_metrics.py` (every PromQL query), `health_model.py` (the SVM transform, score, explanation, embedding, trajectory judgement). `memory_snapshot.py` saves / restores the memory. |
| `4-load-testing/` | k6 scenarios in `k6/` (generated, frozen), the experiment harness, campaign scripts and reports (see "Evaluation harness") |
| `5-ml-training/` | Capacity discovery, healthy data, training (see "ML pipeline"); artifacts; `phase1/` (archived phase-1 pipeline and data) |
| `thesis_notes/` | `system_overview.md` (the whole picture: before / after / now), design decisions (A1–A28), worklogs, results summaries, study guide, defense Q&A (phase-1 versions as `*_phase1.md`), manual testing guide, figures |
| root | `deploy.sh` (full cluster bootstrap), `reset_chroma.py` (empty the `incidents_nfr` collection) |

## Hostnames (ingress, need `/etc/hosts` → 127.0.0.1)
`mwtback.aiops` (backend :3001), `myworldtravel.aiops` (frontend), `chromadb.aiops` (ChromaDB :8000), `prometheus.aiops`,
`grafana.aiops`. All Python code talks to Prometheus and ChromaDB through these hostnames. Nothing uses port-forwards.

## NFRs and the metric contract
- **NFRs:** p95 latency < 0.35 s and errors (5xx) < 1%, as users see them, i.e. at **ingress-nginx**. Cost NFR: at most
  3 pods (see "Pod sizing"). **Defined once in `nfr_metrics.py`** (`NFR_P95`, `NFR_ERRORS`, `MAX_PODS`, and the safe
  level `SAFE_P95` 0.25 s / `SAFE_ERRORS` 0.1%); the ML scripts, the agent, the evaluation and the reports import them.
- The controller is pinned to `controller-v1.15.1` (`deploy.sh` patches in `--enable-metrics=true` and `--time-buckets`
  equal to the backend's buckets: 0.025 … 0.35 … 3, 5, 10 s).
- **Every query lives in `3-ai-agent/nfr_metrics.py`**: throughput (every status), error_rate, latency_p95 (1 m windows,
  `host="mwtback.aiops"`), replicas = desired (`kube_deployment_spec_replicas`), ready_replicas; rps_per_pod derived;
  avg CPU per pod for diagnosis and the HPA target only. `fetch_reading()` returns None if a required metric is missing
  (missing error rate = 0). `fetch_range()` is used by `evaluate_run.py`.
- The detector, the verification, the ML scripts and the evaluation all use these functions, so a reading means the
  same thing everywhere. (In phase 1 the queries were copy-pasted in 4 places.)
- Per-pod diagnosis (`get_pod_breakdown`) still uses the backend's own metrics: CPU, throttling, req/s, CPU per request,
  p95, 5xx, event-loop lag, memory.

## Load
- **Open model:** k6 arrival-rate executors. A closed model hides overload, because slow responses reduce the offered
  load.
- **Request mix:** one source, `k6/lib/mix.js`: 30% search, 25% place, 15% reviews, 10% recommendations, 10% login,
  5% review post, 5% favourite post, with a token pool (`TOKENS_FILE`, created before the idle wait so no login burst
  lands in the measured window).
- **Data:** a generated catalogue (backend `SEED_DATASET=load`: 5015 places, 50206 reviews, 1002 users
  `loaduser<i>@example.com` / `password123`), with in-memory indexes and search pagination.
- **Cost:** the mix costs ~10 ms CPU per request; login (bcrypt) is 10% of the requests but ~70% of the CPU
  (`design_decisions.md` A25).
- **Scenarios** are generated from the capacity table by `k6/make_profiles.py`, then frozen:
  - `baseline.js` (38 min): 42.8 → 123.5 → 210 → 105.2 → 42.8 rps, needs 1→2→3→2→1 pods;
  - `demo.js`: the same shape, shorter, for hand demos (not comparable);
  - `stuck.js` and `cpuhog.js`: 57 rps on 1 pod for 16 min, fault at t = 4 min;
  - `detector_validation.js`;
  - `constant_rate.js` / `ramp_rate.js` for the ML scripts, `endpoint_costs.js`.

## ML pipeline (`5-ml-training/`)
Run the steps in order, with the detector **off** and no other traffic. Each script drives k6 itself through
`k6_driver.py` (`make_token_pool`, `run_k6`, `scale`, `restart_and_wait`). Keep Docker's CPU allocation fixed, and run
`reset_chroma.py` after retraining: memory embeddings live in the model's space.
1. **`capacity_discovery.py`** (~75 min): for 1–4 pods, fresh pods, then the mix at fixed rates in 90 s steps.
   - safe = the highest rate with p95 ≤ 0.25 s and errors ≤ 0.1% (headroom below 0.35 s for the time a scale-up takes);
   - a breaking reading counts only if a second step at the same rate also breaks.
   - Result (2026-10-23): 1 / 2 / 3 / 4 pods = **95 / 165 / 255 / 315 rps** safe; 0.35 s breaks at 100 / 195 / 270 / 335.
   - Writes `capacity_table.json` (also the p95 and CPU per pod at the safe rate) and `capacity_discovery_log.csv`.
2. **`collect_healthy_data.py`** (~55 min): per pod count, a continuous arrival-rate ramp up to the safe rate and back,
   one reading every 15 s.
   - Bands overlap (anti-flapping deadband): N pods start at 70% of safe(N−1), so the bands are 1 pod 1→95, 2 pods
     66.5→165, 3 pods 115.5→255.
   - Writes `baseline_metrics_healthy.csv` (188 readings, 0 errors).
3. **`train_health_baseline.py`** (seconds; v10, A28 / A28.1): keeps healthy rows **within the safe level** (p95 ≤ 0.25 s,
   errors ≤ 0.1%, ≥ 1 rps, every pod ready: 181), then a grid search for **one One-Class SVM** that alone decides at run time.
   - **Inputs in NFR units** (`health_model.transform`): `w_load·`standardized log throughput,
     `w_lat·log(max(p95, 0.25) / 0.35)` (every p95 up to the safe level counts the same, so faster is never worse),
     `w_err·errors / 1%`, `w_rep·replicas`.
   - **Each candidate is judged by:** 40 probes from the measured bands (healthy mid / top, fast, **p95 0.35 s and 1%
     errors at every pod count**, above the band ×1.1, waste, after scale-down, stuck, outage); **monotonicity in latency**
     on a grid; held-out false alarms (ramp-up ↔ ramp-down).
   - **Pre-declared selection rule (A28):** all probes → monotone → fewest held-out wakes → largest probe margin over the
     decision noise → fewest held-out flags → smaller γ, lighter weights.
   - **Selected:** γ 0.2, weights load 1 / latency 2 / errors 1 / pods 8, ν 0.02; 6 support vectors; 40/40 probes,
     monotone, held-out 2 wakes, margin / noise 1.04. Healthy bands (rps, at the safe latency): 1 pod 4–87, 2 pods
     73.7–162.4, 3 pods 123.7–251.5. `noise_eps` 0.147; memory "similar" ≤ 0.43.
   - The method declared first (learn "normal latency for this load" below the safe level, with lower-latency copies)
     **failed** monotonicity and held-out; A28.1 records it and the change.
   - Writes `health_model.pkl` (gitignored), `training_report.json` and `baseline_metrics_healthy_filtered.csv`.

**The score (`health_model.score`)** is the SVM's own decision read as a distance: 0..1 when healthy (1 = typical for the
pod count), below 0 = minus the distance from the healthy region (the log of the RBF kernel sum, so it does not flatten:
stuck 100% errors ≈ −100, cpuhog p95 0.7 s ≈ −2). Same sign as the SVM's `decision_function`. The SVM flags latency above
~0.28–0.33 s at every pod count and load. (v9's score was the raw decision function: +0.01..0.06 healthy, −0.537 for every
fault; A26.)

## Runtime flow
**Detector** (`anomaly_detector.run_monitor`, every 10 s):
- **Skips** a reading if a metric is missing, if the replica count changed less than 90 s ago (`REPLICA_SETTLE_SECONDS`),
  or if throughput < 1 rps (`MIN_THROUGHPUT_RPS`).
- **Outages are anomalies, not low traffic:** when no pod is ready, the ingress answers fast 503s, and throughput counts
  every status.
- **Wakes the agent** after 3 anomalous readings in a row (`ANOMALY_STREAK_REQUIRED`); then a 60 s cooldown
  (`AGENT_COOLDOWN_SECONDS`).
- **The JSON the agent gets** holds the reading, the score, its explanation (`health_model.explain`: which metrics lie
  outside their healthy range, in physical units) and the **load trend** (least-squares slope of throughput over the last
  60 s, rps/min).
- **Re-wake:** if the agent's verification says UNSTABLE (worse or not improving), the next anomalous reading wakes it
  again at once (no streak, cooldown or settle), at most `MAX_REWAKES` = 2 times in a row. A normal reading cancels it.
- **`--dry-run`** never imports the agent. It logs every evaluated reading to `5-ml-training/dry_run_readings.csv` (an
  existing file is moved aside, never overwritten).
- SIGTERM is handled like Ctrl+C (prints a summary).
- **Blind spot:** a request is counted when it finishes. A process that never answers is seen only when nginx times out.

**Agent v10** (`agent.trigger_ai_agent`, returns `{"resolved", "rewake", "verdict"}`; prompt and tools as v9):
- **Computed facts** (`agent._computed_facts`):
  - the score and its explanation (with the objectives); ready vs desired pods;
  - load, load per pod and the trend (steady / RISING / falling);
  - the **minimum pod count** = the smallest count the **health model** calls healthy for max(rps, rps + max(0, trend)
    × 1.5 min) (`health_model.min_healthy_pods`; the headroom is in the model's safe-level data). v9 used 15% over the
    capacity table;
  - where the load sits in the model's healthy band of the current count: ABOVE / BELOW / inside.
- **Prompt v9** (objectives from `nfr_metrics`):
  - NFR objectives, the capacity table (1–3 pods), the facts, "YOUR RECENT ACTIONS" (the last 15 min with their
    verdicts, in-process: `agent.RECENT_ACTIONS`) and the incident memory.
  - Step 1 classifies: (A) capacity, when the minimum ≠ current and the pods are ready: scale to the minimum, no
    investigation, and scale down when over-provisioned; (B) anything else.
  - In (B) the agent looks at all three observation tools, then acts on the cause: restart on evidence of a bad process
    state (ERROR lines or a stuck / runaway job in the logs, unready pods, event-loop lag or CPU per request several
    times healthy); scale if it is capacity after all. A recent deployment change → "No action taken … needs a human
    decision", because there is no undo tool. A short breach without evidence → no action.
- **5 tools** (top of `agent_tools.py`): `get_pod_breakdown`, `get_deployment_history`, `get_kubernetes_logs`,
  `scale_kubernetes_deployment`, `restart_kubernetes_deployment` (rolling).
  - Guards: namespace and deployment hard-coded; replicas 1–3 (`MAX_REPLICAS`); at most ±2 per call; cooldowns 30 s
    (scale) and 60 s (restart).
  - `add_base_tools=False`, `max_steps=10`.
  - Pod restart and rollback were removed in phase 2 (the user's decision).
- **Three behaviour guards** (smolagents `step_callbacks` + `final_answer_checks`, off with `AIOPS_ACT_GUARD=off`):
  1. no action or final answer in the same step as an observation;
  2. no claimed action without a tool call (a final answer must start "No action taken" if nothing ran);
  3. no restart before all three observation tools ran.

  Each was added after the LLM broke the rule in a measured phase-1 run. `tests/test_final_agent.py` replays those
  incidents through a real CodeAgent.
- **Verification** (`agent_tools._check_stabilization`, run by code after the LLM, even if it crashed after acting):
  - waits for the rollout (≤ 90 s), then reads the detector's features every 10 s and scores them;
  - `health_model.judge_trajectory`, **the user's rule, one reading at a time** (v10):
    - a healthy reading (score ≥ 0) → **STABLE**;
    - before the 1 m windows hold only post-action data (60 s): only STABLE or WAIT;
    - after that: a fall by more than `noise_eps` since the reading before → **UNSTABLE: worse**; no rise beyond it over
      3 readings → **UNSTABLE: not improving**; else WAIT;
  - gives up after 240 s.
  - A failed scale-down is undone by code (`agent._rollback_failed_scale_down`: restores the pod count, not a version).
    Any other UNSTABLE asks for a re-wake.
  - Success is decided by `agent_tools.run_outcome`, never by parsing the LLM's text.
- **Memory** (ChromaDB collection `incidents_nfr`, `embedding_function=None`):
  - the embedding is the model's transformed feature vector (`health_model.embedding`);
  - every outcome is saved: `status` resolved or failed, with metrics, score before / after, actions, verdict,
    diagnosis and recovery time;
  - retrieval (`query_knowledge_base`) returns the top-2 **resolved** incidents closer than the model's
    `memory_similar_max` (its separation of a healthy state from an early overload); otherwise the prompt says there is
    no similar incident;
  - `AIOPS_MEMORY=off` disables lookup and save;
  - ChromaDB is connected lazily and retried. The volume is at `/data`, so memory survives restarts (in phase 1 it was
    lost on every ChromaDB restart).
- **LLM:** primary `gemini/gemini-3.1-flash-lite`; fallback `gemini/gemini-2.5-flash` (`AIOPS_FALLBACK_MODEL=<model>|off`).
  - `RetryingLiteLLMModel` retries transient errors and empty responses after 5 / 15 / 30 s, then tries the fallback.
  - **No per-call timeout of our own** (litellm's default is 6000 s): a stalled provider call can block an incident
    (`design_decisions.md` A27).
- **`3-ai-agent/incident_log.csv`:** one row per agent run (reading, score, memory hit, actions, verdict, recovery,
  re-wake, LLM calls / retries / fallback, seconds, final answer). It is the source of the per-incident numbers. A run cut
  by SIGTERM leaves no row; `campaign_report.py` finds such wake-ups in the run's `controller.log`.

## Pod sizing: 1 core per backend pod
- **Request = limit = 1 core.** Node runs JavaScript on one thread, so a 1-core pod measures the app's real limit.
- **Login cost:** ~71 ms CPU (bcrypt). It fits in one 100 ms CFS period, so throttling rises only when requests really
  pile up.
- **Don't change the size** without redoing capacity, data collection and training.
- **Ceiling of 3 pods** (`MAX_REPLICAS`, the capacity table the agent sees is cut to 1–3). With the phase-2 mix, 4 pods
  still add capacity (315 rps), so 3 is a cost NFR, not a hardware limit any more. Above ~315 rps the laptop itself
  collapses (k6, ingress and cluster share it).
- **HPA target:** CPU 60% (`4-load-testing/baselines/hpa.yaml`: 1–3 pods, scale-down stabilization 120 s). With the
  default 10% tolerance it scales up at ~0.66 core ≈ 80 rps per pod, below every count's safe load. 2 pods (82.5 rps per
  pod) bind (A25).

## Model choice (why a One-Class SVM)
- **Phase 1 replaced an Isolation Forest** (2026-09-30). An IF scores any value beyond the training range like the edge
  point, so it cannot see one-directional drift (waste, stuck); evidence in A2/A3 and `thesis_notes/figures/detector_evidence.py`.
- **Phase 2 replaced the per-replica models with one SVM** that takes the pod count as an input, as the supervisors asked.
  The two forms (load per pod / total) were compared under a pre-declared rule (A26).
- **v10 (A28 / A28.1):** the NFRs are built into the model instead of rules around it. An RBF SVM cannot both learn
  "normal latency for this load" and be monotone in latency (the declared method failed), so latency counts only above the
  safe level; the score is read as a distance.
- **Live validation** (`detector_validation.sh`, 2026-10-23): 4/4 overload and waste phases caught (52–75 s), 0 false
  wakes in normal phases (A27).

## Evaluation harness (`4-load-testing/`)
- **`run_experiment.sh <llm|hpa> [notes]`:**
  - clean reset: rolling restart, 1 replica, rollout history reset, token pool, 120 s idle;
  - starts ONE strategy, runs `k6/<SCENARIO>.js` (`SCENARIO=baseline|stuck|cpuhog`; the fault is injected at t = 4 min),
    stops it, scores it;
  - writes `eval_[<scenario>_]<strategy>_<time>/`: controller.log, k6.log, `k6_summary.json`, `series.json`,
    `events.txt`, `pods_at_end.txt`, `power.log` (AC or battery every 30 s), window and score;
  - appends one row to `results_nfr.csv` / `results_nfr_stuck.csv` / `results_nfr_cpuhog.csv`;
  - env: `AIOPS_MEMORY`, `AIOPS_ACT_GUARD`, `LABEL` (default `llm-v10` / `hpa`; `*-INVALID` rows are excluded).
    `compare_results.py` / `campaign_report.py` take `AGENT_LABEL` (default `llm-v10`; `llm-v9` for campaign-2026-10-23).
  - Never run two strategies at once (`queue.sh` runs them back to back).
- **`evaluate_run.py`** scores a window at the ingress:
  - `nfr_violation_s` (p95 > 0.35 s or errors > 1%), `errors_pct`;
  - p95 mean / p99, `replica_minutes` (cost), under / over-provisioned and `correct_prov_pct` (vs the capacity table);
  - scale actions with timestamps, unready seconds, liveness restarts, `on_battery_s`, k6 client p95 / failed / dropped;
  - for faults, `recovery_s` (NFRs hold for 60 s);
  - for agent runs, the incidents from `incident_log.csv`.
- **`full_campaign.sh [TAG]`:** the comparison in one go.
  - `NORMAL_RUNS` × baseline and `FAULT_RUNS` × each fault per method, agent and HPA alternating.
  - Memory is emptied at the start; it is on for normal load, off for faults.
  - Every run waits for AC power; an agent run waits until `llm_ready.py` gets 3/3 answers from the primary model.
  - sha256 of code, model and scenarios are logged.
  - At the end it runs `compare_results.py TAG` (→ `comparison_nfr.md` + timelines, **this campaign's runs only**) and
    `campaign_report.py TAG` (→ `<TAG>.md`: per agent run, right action at the first wake-up after the fault, recovery,
    fallback use, guard refusals, wake-ups before the fault, wake-ups without a finished agent run, provenance check).
  - Stop: `pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh`.
- **`detector_validation.sh` + `analyze_validation.py`:** scripted dry-run validation, phases A–I.
- **`replay_model.py [TAG]`:** the current health model, verification rule and minimum pod count replayed offline on
  the A–I validation readings and on a campaign's recorded runs (`series.json`, controller.log, incident_log) →
  `replay_v10.md` (A28 acceptance criteria 2–5).
- **`inject.sh stuck|cpuhog|reset|status`:** hand testing (`thesis_notes/manual_testing.md`).
- **Prometheus keeps 10 days.** Every run's series is in its `series.json`.

## Results of the phase-2 campaign (`campaign-2026-10-23`, 4 + 4 runs per scenario; A27, `results_summary.md`)

| | HPA | Agent v9 |
|---|---|---|
| Normal load: NFR violation | 0 s | 108 ± 25 s (almost all at the first scale-up) |
| Normal load: cost | 76.3 replica-min | 71.5 (−6.3%, permutation p = 0.014) |
| Normal load: correct provisioning | 78% | 83% |
| Stuck: recovery | never (0/4) | 4/4, restart, 138 s |
| Cpuhog: recovery | never (0/4), scaled to 2–3 pods | 3/4, restart, 113 s; the 4th was lost to a stalled LLM provider |

- **Agent decisions:** all 16 scale actions and all 7 fault restarts were right at the first wake-up and verified STABLE;
  0 re-wakes.
- **False wakes:** one, before a fault (p95 0.31 s), which the agent correctly declined.
- **Why the agent has NFR violation on normal load:** it reacts at the anomaly boundary, plus LLM time. The HPA scales
  ahead with headroom and pays for it in cost.
- **Limits:** LLM provider dependency, shallow liveness by design, n = 4, one machine.

## Running
```bash
./deploy.sh                                   # recreates kind cluster "aiops-cluster" + everything
source .venv/bin/activate                     # Python 3.13; pip install -r requirements.txt
export GEMINI_API_KEY=...                     # the root .env is NOT auto-loaded by the Python code (run_experiment.sh reads it)
python 3-ai-agent/anomaly_detector.py --dry-run   # validate a model first: no agent calls
python 3-ai-agent/anomaly_detector.py         # live
k6 run 4-load-testing/k6/demo.js              # in another terminal
SCENARIO=stuck ./4-load-testing/run_experiment.sh llm     # one measured run
```
- Tests: `.venv/bin/python3 -m pytest 3-ai-agent/tests -q` (86: detector loop, tools and guards, facts and prompt, score
  trajectory, memory, CodeAgent replays; everything external mocked).
- Backend: `cd 2-target-app/software-backend && npm test` (Jest, 812).
- After changing the backend: `docker build -t aiops-backend:latest 2-target-app/software-backend/ && kind load docker-image aiops-backend:latest --name aiops-cluster && kubectl rollout restart deployment/aiops-backend-deployment`.

## Conventions / notes
- Comments and log messages mix Greek and English. That's fine; the user is Greek.
- Never read or print `.env` values (they hold HF / Gemini / OpenRouter keys).
- The code keeps only the final version. Removed things are recorded in `thesis_notes/removed_and_archived.md`, decisions
  in `design_decisions.md`.
- `THESIS_SUMMARY_EN.md` holds the research framing of phase 1.

## Known issues / gotchas
- **The in-memory DB is per pod:** writes (reviews, favourites) are not shared between pods. They are kept few (10% of the
  mix), and this is a threat to validity.
- **Replica metric lag:** kube-state-metrics shows a scale a few seconds late, so the first reading after a change can
  show the old count.
- **Node keep-alive:** must stay above nginx's 60 s (`server.js`: 65 s), or nginx sends POSTs to closed connections (502).
- **Rate limiting** is disabled in the deployment (`AUTH_RATE_LIMIT_ENABLED=false`): k6 sends every login from one IP.
- **`/chaos/zombie`** (a non-blocking 10 s delay) is a leftover and is not used; use `stuck` / `cpuhog`.
- **Battery:** runs on battery are slower. `power.log` and `on_battery_s` flag them, and such runs are relabelled
  `*-INVALID` and repeated.
- **Host load** matters: keep only Docker and the terminal open during measurements.
