# CLAUDE.md

Thesis project: **autonomous resource management of a Kubernetes workload with an LLM agent (AIOps)**, built around the
service's **non-functional requirements (NFRs)**. A monitor scores the NFR metrics, measured at the ingress, with one
One-Class SVM. When the SVM flags an anomaly, it wakes an LLM "SRE agent" (smolagents `CodeAgent` + Gemini via LiteLLM).
The agent reads code-computed facts, a measured capacity table and similar past incidents from ChromaDB, investigates
with observation tools, and then scales or restarts the backend. Code verifies every action by following the SVM score.
The comparison is against the native Kubernetes HPA.

**Two phases.**
- **Phase 2** (since 2026-10-22, after a meeting with the supervisors): NFRs, request mix, one SVM, HPA-only comparison.
  Decisions and results: `thesis_notes/design_decisions.md` A24–A31. Log: `thesis_notes/phase2_worklog.md`. One-page
  summaries: `thesis_notes/results_summary.md` (v12, the current version); older versions in `thesis_notes/history/<version>/`. **Reading
  order and the version map: `thesis_notes/README.md`** (the files at the top of `thesis_notes/` always describe the
  current version; superseded ones go to `thesis_notes/history/`).
  - **Agent v13 is the current code** (branch `nfr-v13`, since 2026-11-02; A32, A32.1, **live-checked 2026-11-03, no campaign yet**): v12's
    model, prompt and tools, with two changes the user asked for.
    - **A32:** the detector judges every reading after a pod-count change ("να κρίνει αμέσως αν είμαστε stable, το οποίο
      καθορίζεται από το SVM"). v12 skipped 90 s, counted from when it saw the change, i.e. after the agent's verification
      had already watched it. A change the verification watched is judged as usual; any other one (a person, the
      validation script, a rollback) is followed with the verification's rule.
    - **A32.1:** no fixed times in the judgement ("δεν μ' αρέσουν τα σκληρά χρονικά όρια, θέλω κάτι πιο δυναμικό"). After
      a change every reading holds only data since it took effect (the window starts there and grows to the usual
      minute; the first such reading 20 s after it, two scrapes). The verification is the user's rule on those readings:
      healthy → STABLE, a fall → worse, no rise over 3 readings → not improving, each against the measured noise of that
      comparison (`window_noise.json`). v12's "worse from 10 s / not improving from 60 s" existed only because 1 m windows
      mix the minute before the change in.
    - Offline (`4-load-testing/replay_v13.py` → `replay_v13.md`): 113/113 right actions of phase 2 STABLE (104 of them at
      +20 s; recorded 0–70 s), the false "not improving" of 1/11 18:04 now STABLE, the UNSTABLE test 3/3 (30 / 30 / 50 s);
      the detector's wake-ups as v12's in the validations and in 51/51 agent runs; one real NFR breach the 90 s had hidden
      (28/10 09:42) now wakes the agent. The user also **rejected** a fact saying the load exceeds the maximum capacity
      (2/11).
    - **Live check (2026-11-03, `archive/v13_live_queue.sh`, `archive/v13_live_stuck.sh`; A32.1):** validation 4/4 anomaly
      phases (63 / 75 / 76 / 67 s), 0 false wakes (the G wake is a real ingress breach: 1 m p95 0.54 s for 50 s, backend
      0.074 s); after each hand change the first judgement 28–36 s after the command (v12 ~100 s); replay = live to 10 s.
      Smoke runs (`smoke-v13-2026-11-03`): normal load 4/4 actions STABLE at +20 s (v12's 1→2: 40–50 s), NFR violation 120 s
      all at 1→2 (2 × ServiceUnavailable, agent 70 s), cost 71.3; stuck: restart, STABLE at +20 s (v12: 60 s), recovery
      130 s, 7.0% errors. No live UNSTABLE (no wrong action). Next: the v13 campaign, with the user's OK.
  - **Agent v12** (A31) = git tag `v12-campaign`: v11's model tested with **range probes
    that cover every case** (one healthy interval per pod count, no hole: v11 had one at 17.8–19.4 rps on 1 pod), trained
    with the 1-pod low end (1–4 rps), the minimum pod count below every band = the smallest, and the verification judging
    "worse" from 10 s after the rollout ("not improving" still from 60 s, A31.1). The prediction-based wake was analysed
    and **rejected by the user** (worklog 1/11).
    Replayed offline (`4-load-testing/replay_v12_campaign-2026-10-2[368].md`): every A31 criterion passes except the first
    normal-load wake, +10 s in 1 of 13 runs (accepted by the user). Live checks: `archive/v12_live_queue.sh` (see A31).
    **Measured in `campaign-2026-11-01`** = git tag `v12-campaign` (measured code `4d48374`; results below).
  - **Agent v11** (A30) = git tag `v11-campaign` (measured code `92b8c51`, **campaign-2026-10-28**, results below): v10's
    design with the health model's inputs in NFR units and no tuned weights (only gamma is chosen) and the explanation
    from the model. Its model files in `5-ml-training/v11/`, its live validation in `archive/detector_validation_v11/`, its
    comparison in `4-load-testing/archive/comparison_campaign-2026-10-28_v11/`.
  - **Agent v10** (A28 / A28.1, A29) = git tag `v10-campaign` (measured code `4308c93`, campaign-2026-10-26): one SVM that
    alone decides, the NFRs in its data and input scale, the score read as a distance, the user's verification rule, the
    minimum pod count from the model. Its model files in `5-ml-training/v10/`, its live validation in
    `archive/detector_validation_v10/`, its comparison in `4-load-testing/archive/comparison_campaign-2026-10-26_v10/`.
  - **Agent v9** = git tag `v9-campaign` (measured code `5cf4960`, campaign-2026-10-23); its model files in
    `5-ml-training/v9/`; its comparison in `4-load-testing/archive/comparison_campaign-2026-10-23_v9/`.
- **Phase 1** is git tag `v8.1-campaign` (agent v3–v8.1, CPU-based per-replica SVMs, login-only closed-model load, rule /
  static baselines, badconfig scenario). Documented in `design_decisions.md` A1–A23,
  `thesis_notes/removed_and_archived.md` and `thesis_notes/history/phase1/` (results summary, study guide, defense Q&A,
  the English research framing `THESIS_SUMMARY_EN.md`, the early notes of 1–4/10). Its data:
  `5-ml-training/phase1/`, `4-load-testing/evaluation_results*.csv`, `comparison.md`, `3-ai-agent/incident_log_phase1.csv`.

## Layout (numbered folders = pipeline order)

| Folder | What it is |
|---|---|
| `1-infrastructure/` | kind cluster config (ports 80/443), kube-prometheus-stack values, ServiceMonitors (backend `/metrics`; `ingress-metrics.yaml` for ingress-nginx :10254), ingresses, ChromaDB (pinned digest, PVC at `/data`) |
| `2-target-app/` | The **system under management**: "myWorld Travel" (from a Software Engineering II course project). `software-backend/`: Node 18 / Express, in-memory DB, bcryptjs login, prom-client metrics, `/health` (shallow), `/ready`, `POST /chaos/stuck`, `POST /chaos/cpuhog`. `software-frontend/`: React + Vite behind nginx. The k8s manifests sit at this folder's top level (`backend-deployment.yaml`: 1 core / 1 GiB, readiness and liveness probes, `SEED_DATASET=load`). |
| `3-ai-agent/` | The runtime: `anomaly_detector.py` (main loop) → `agent.py` (facts, prompt, CodeAgent, LLM retries) → `agent_tools.py` (5 tools, guards, verification, memory). Shared modules: `nfr_metrics.py` (every PromQL query), `health_model.py` (the SVM transform, score, explanation, embedding, trajectory judgement). `memory_snapshot.py` saves / restores the memory. |
| `4-load-testing/` | k6 scenarios in `k6/` (generated, frozen), the experiment harness, campaign scripts and reports (see "Evaluation harness") |
| `5-ml-training/` | Capacity discovery, healthy data, training (see "ML pipeline"); artifacts; `phase1/` (archived phase-1 pipeline and data) |
| `thesis_notes/` | `README.md` (start here), `system_overview.md` (the whole picture: before / after / now), design decisions (A1–A31), worklogs, results summary, study guide, defense Q&A, manual testing guide, figures; superseded versions in `history/` |
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
2. **`collect_healthy_data.py`** (~75 min): per pod count, a continuous arrival-rate ramp up to the safe rate and back,
   one reading every 15 s; then the **1-pod low end as a staircase of constant rates** (4 → 3 → 2 → 1.5 → 1 rps and back,
   120 s each, readings once the 1 m windows hold only that level; `--low-end-only` appends just this, 2026-11-01).
   - Bands overlap (anti-flapping deadband): N pods start at 70% of safe(N−1), so the bands are 1 pod 1→95, 2 pods
     66.5→165, 3 pods 115.5→255.
   - Why the staircase (A31): throughput is a 1 m rate, so on a ramp it lags the target; the ramps of 2026-10-23 never
     showed 1 pod below 3.9 rps, and the model then called 1 pod at 1–3.9 rps an anomaly.
   - Writes `baseline_metrics_healthy.csv` (218 readings: 188 ramp of 2026-10-23 + 30 staircase of 2026-11-01, column
     `segment`; 0 errors).
3. **`train_health_baseline.py`** (seconds; v12, A31): keeps healthy rows **within the safe level** (p95 ≤ 0.25 s,
   errors ≤ 0.1%, ≥ 1 rps, every pod ready: 210), then chooses gamma for **one One-Class SVM** that alone decides at run time.
   - **Inputs in NFR units, no tuned weights** (`health_model.transform`): ln(throughput);
     latency `ln(max(p95, 0.25) / 0.25) / ln(0.35 / 0.25)` and errors `(max(err, 0.1%) − 0.1%) / (1% − 0.1%)`, i.e.
     0 = the safe level, 1 = the objective, everything within the safe level the same (faster is never worse);
     `POD_SEPARATION` (100) × replicas (one healthy region per pod count).
   - **What it learns:** every healthy reading sits at the safe level of both NFRs, so from the data the SVM learns the
     healthy load band of each pod count (which the latency set through the safe level); latency and errors count as the
     distance above the safe level (A28.1 note, `study_guide.md` §4.4).
   - **Why a scan along the load covers every reading (A31):** every support vector then sits on the load axis, so for N
     pods the kernel sum is exp(−γ·r²) · K_N(ln rps), r = the distance above the safe level: healthy ⟺
     r² ≤ ln(K_N/ρ)/γ. The load band, the latency / errors tolerated at each load and the monotonicity all follow from
     K_N; the script checks the premise and scans 0.5–1000 rps in 0.25% steps.
   - **Each candidate is judged by 34 range probes** (A31; the result of a probe = the worst point of its range), per pod
     count: healthy across the whole band [1.05·lo, 0.95·hi]; **one healthy interval (no hole, no island)**; every load
     ≥ 1.1·hi anomalous; every load ≤ 0.8·lo anomalous (N ≥ 2); **p95 0.35 s and 1% errors anomalous at every load**;
     N+1 healthy after a scale-up and N−1 after a scale-down (the bands overlap); 1 pod healthy at 1.05–4 rps (idle); the
     measured faults (stuck, outage, stuck as measured 4.6 s / 48%, cpuhog 0.7 s); plus **monotonicity in latency and
     errors** on a grid and held-out false alarms ("up" ↔ "down" readings). v11's 40 point probes missed the 1-pod hole.
   - **Pre-declared selection rule (A28, kept in A30, A31):** all probes → monotone → fewest held-out wakes → largest probe
     margin over the decision noise → fewest held-out flags → smaller γ. Grid γ ∈ {0.1, 0.2, 0.5, 1.0}, ν 0.02.
   - **Selected (v12):** γ 0.1, the only candidate passing every probe (γ 0.2 has a hole at 8–10 rps on 1 pod, γ 0.5 two,
     γ 1.0 three); 6 support vectors; 34/34, monotone, held-out 2 wakes (16/210 flags), margin / noise 0.642. Healthy bands
     (rps): 1 pod **1.0–87.3**, 2 pods 73.5–162.1, 3 pods 123.3–251.3. `noise_eps` 0.142; memory "similar" ≤ 0.42.
     (v11: γ 0.5, 40/40 point probes, bands 3.9–87.0 / 73.3–161.5 / 123.7–251.5. v10: γ 0.2 with weights load 1 /
     latency 2 / errors 1 / pods 8 from a 144-point grid, margin / noise 1.04.)
   - The method declared first (learn "normal latency for this load" below the safe level, with lower-latency copies)
     **failed** monotonicity and held-out; A28.1 records it and the change.
   - Writes `health_model.pkl` (gitignored), `training_report.json` and `baseline_metrics_healthy_filtered.csv`.
4. **`measure_window_noise.py`** (seconds from its saved readings; v13, A32.1): the noise of a comparison of readings
   after a change, in the model's score units, by seconds since the change (a fall 10 s apart: 0.38 at +30 s → 0.10 at
   +60 s; a rise 30 s apart: 0.47 at +50 s → ~0.25), from the steady anomalous periods of the HPA fault runs (345
   sequences, 27 runs). Writes `window_noise.json` (loaded with the model, which it must match: rerun after retraining)
   and keeps its readings in `window_noise_readings.json` (Prometheus keeps 10 days).

**The score (`health_model.score`)** is the SVM's own decision read as a distance: 0..1 when healthy (1 = typical for the
pod count), below 0 = minus the distance from the healthy region (the log of the RBF kernel sum, so it does not flatten:
stuck 100% errors ≈ −111, cpuhog p95 0.7 s ≈ −3). Same sign as the SVM's `decision_function`. The v12 SVM (γ 0.1, smoother)
flags latency above ~0.33 s in the middle of the 1-pod band (0.31 s at 57 rps), ~0.285 s mid-band on 2 and 3 pods and
~0.27 s at every band edge; errors above ~0.83% / 0.45% / 0.27% likewise (v11: ~0.28 s / 0.4% mid-band; v10: 0.30–0.325 s).
The NFRs are anomalous at every load (R ≤ 0.81 < 1). (v9's score was the raw decision function: +0.01..0.06 healthy,
−0.537 for every fault; A26.)

## Runtime flow
**Detector** (`anomaly_detector.run_monitor`, every 10 s):
- **Skips** a reading if a metric is missing or if throughput < 1 rps (`MIN_THROUGHPUT_RPS`). Nothing else is skipped.
- **After a change (v13, A32, A32.1)** its readings hold only data since the change took effect
  (`nfr_metrics.clean_window`: the window starts there and grows to the usual minute; none before 20 s).
  - A change the agent's verification watched (STABLE, or UNSTABLE with a re-wake; scale or restart): the agent returns
    `changed_at` (its rollout, `time.monotonic` of the same process), and the readings after it are judged as usual.
  - Any other pod-count change (a person, the validation script, the rollback of a failed scale-down) is **followed** from
    the reading that shows its pods ready (or after 90 s) with the verification's rule (`health_model.judge_trajectory`):
    healthy → normal monitoring at once; anomalous but moving towards healthy → wait, not counted; worse / not improving /
    still anomalous after 4 min → a confirmed anomaly. Columns `window` and `follow` in the dry-run CSV.
  - v12 skipped every reading for 90 s (`REPLICA_SETTLE_SECONDS`, removed).
- **Outages are anomalies, not low traffic:** when no pod is ready, the ingress answers fast 503s, and throughput counts
  every status.
- **Wakes the agent** after 3 anomalous readings in a row (`ANOMALY_STREAK_REQUIRED`); then a 60 s cooldown
  (`AGENT_COOLDOWN_SECONDS`, a bound on LLM calls, e.g. while an anomaly the agent answered with "No action" lasts).
- **The JSON the agent gets** holds the reading, the score, its explanation (`health_model.explain`, in physical units:
  the load against the model's band for the pod count, latency and errors against the safe level, with the objectives)
  and the **load trend** (least-squares slope of throughput over the last
  60 s, rps/min).
- **Re-wake:** if the agent's verification says UNSTABLE (worse or not improving), the next anomalous reading wakes it
  again at once (no streak or cooldown), at most `MAX_REWAKES` = 2 times in a row. A normal reading cancels it.
- **`--dry-run`** never imports the agent. It logs every evaluated reading to `5-ml-training/dry_run_readings.csv` (an
  existing file is moved aside, never overwritten).
- SIGTERM is handled like Ctrl+C (prints a summary).
- **Blind spot:** a request is counted when it finishes. A process that never answers is seen only when nginx times out.

**Agent v14** (`agent.trigger_ai_agent`, returns `{"resolved", "rewake", "verdict", "changed_at"}`; decision procedure and
tools as v9, the rest as v10, with v12's minimum pod count, v13's detector and verification, and A33's prompt):
- **Computed facts** (`agent._computed_facts`):
  - the score and its explanation (with the objectives); ready vs desired pods;
  - the **minimum pod count** = the smallest count the **health model** calls healthy for max(rps, rps + max(0, trend)
    × 1.5 min) (`health_model.min_healthy_pods`; the headroom is in the model's safe-level data; the 1.5 min spans the
    1 m window's lag on a ramp, the agent and a new pod). When no count is healthy: the smallest count whose band does
    not end below the load, i.e. 1 below every band and 3 above them (v12; v10 / v11 said 3 in both cases). v9 used 15%
    over the capacity table. The trend changed the minimum in 3 of 113 wake-ups since v10, all right;
  - where the load sits in the model's healthy band of the current count: above / below / inside.
- **Prompt v14** (A33, 2026-11-03; v9–v13's in `4-load-testing/archive/prompt_v13/`):
  - **our own system prompt** (`agent.SYSTEM_PROMPT`, in place of smolagents' generic one; `make_sre_agent` builds the
    CodeAgent with it and `code_block_tags="markdown"`): the role, the NFR objectives, what each pod count serves (the
    model's healthy band next to the measured load where the p95 objective breaks), how to decide, how to work (each
    reply a "Thoughts:" line and one ```` ```python ```` block, the form of smolagents' own correction message; one tool
    per step), the tools from their docstrings. A reply that is bare Python calling something gets its fence in code
    (`agent._fence_bare_code`, counted as `fenced`): CodeAgent appends a closing fence to it and then cannot parse it
    (the first draft, reasoning as comments, lost a step that way in 17 of 44 capacity runs of the evaluation);
  - **one message per wake-up with the incident only** (`agent.incident_message`): the reading in units with its window
    (the detector sends `window`), the facts, "Your recent actions" (the last 15 min with their verdicts, in-process:
    `agent.RECENT_ACTIONS`), the incident memory, and as the last line the task with its three key constraints;
  - how to decide (v9's procedure): classify (A) capacity, when the minimum ≠ current and the pods are ready: scale to
    the minimum, no investigation, and scale down when over-provisioned; (B) anything else: all three observation tools,
    then act on the cause: restart on evidence of a bad process state (ERROR lines or a stuck / runaway job in the logs,
    unready pods, event-loop lag or CPU per request several times healthy); scale if it is capacity after all. A recent
    deployment change → "No action taken … needs a human decision", because there is no undo tool. A short breach
    without evidence → no action;
  - why (A33): until v13 smolagents asked for `<code>` blocks and our prompt for ```` ```python ````, and 15 of 581
    phase-2 steps (9 runs) failed on a stray `python` line; plus two capacity numbers for one thing, raw JSON, the
    phase-1 "signature", generic examples and shouting. Evaluated against v13's prompt on 47 recorded wake-ups with the
    real LLM before any live run (`4-load-testing/prompt_eval.py` → `prompt_eval.md`).
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
  - waits for the rollout (≤ 90 s); then reads the detector's features **on data since the rollout only** (v13, A32.1:
    the first reading 20 s after it, then every 10 s, the window growing to the usual minute) and scores them;
  - `health_model.judge_trajectory(bundle, points)`, **the user's rule, one reading at a time** (v10), with no fixed times:
    - a healthy reading (score ≥ 0) → **STABLE**;
    - a fall since the reading before by more than the noise of that comparison → **UNSTABLE: worse**;
    - no rise over the last 3 readings (30 s) by more than the noise of that comparison → **UNSTABLE: not improving**;
    - else WAIT; still anomalous 240 s after the rollout → UNSTABLE.
  - The noise depends on how much data the readings hold (`health_model.change_noise`, `window_noise.json`, measured).
  - v12 judged the usual 1 m readings, which mix the minute before the action in, so it judged "worse" only from 10 s and
    "not improving" only from 60 s (A31, A31.1; a right scale 1→2 was called UNSTABLE at +40 s in the smoke run of 1/11).
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
  - `RetryingLiteLLMModel` retries transient errors and empty responses after 5 / 15 / 30 s, then tries the fallback;
    it is the only retry policy (smolagents' own uncounted 60 s / 120 s retry of 429s is off, `retry=False`), and the log
    names the quota a 429 hit.
  - **Each call is cut after 60 s** (`CALL_TIMEOUT_SECONDS`, v14, A33; proposed in A27) and retried like a 503. Until v13
    litellm's 6000 s default applied: a stalled call lost a cpuhog run on 23/10 and held single evaluation runs 31–163 min
    on 3–4/11.
  - **The key is on Gemini's free tier:** the fallback has 20 requests per day (quota resets at 10:00 Greek time), so it
    helps only for a few calls a day.
- **`3-ai-agent/incident_log.csv`:** one row per agent run (reading, score, memory hit, actions, verdict, recovery,
  re-wake, LLM calls / retries / fallback / fenced replies (v14), seconds, final answer). It is the source of the per-incident numbers. A run cut
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
- **v11 (A30):** the same, with the units taken from the NFRs instead of tuned weights (0 = safe level, 1 = objective, for
  latency and errors); only gamma is chosen.
- **v12 (A31):** the same model, tested with range probes that cover every case (exact, because every support vector sits
  at the safe level) and trained with the 1-pod low end; the rule then chose γ 0.1, the only gamma with no hole.
- **Live validation** (`detector_validation.sh`): v11 (2026-10-27) 4/4 (52–75 s), 0 false wakes (A30); v10 (2026-10-26)
  4/4 overload and waste phases caught (52–84 s), 0 false wakes in normal phases (A29); v9 (2026-10-23) 4/4 (52–75 s),
  0 (A27).

## Evaluation harness (`4-load-testing/`)
- **`run_experiment.sh <llm|hpa> [notes]`:**
  - clean reset: rolling restart, 1 replica, rollout history reset, token pool, 120 s idle;
  - starts ONE strategy, runs `k6/<SCENARIO>.js` (`SCENARIO=baseline|stuck|cpuhog`; the fault is injected at t = 4 min),
    stops it, scores it;
  - writes `eval_[<scenario>_]<strategy>_<time>/`: controller.log, k6.log, `k6_summary.json`, `series.json`,
    `events.txt`, `pods_at_end.txt`, `power.log` (AC or battery every 30 s), window and score;
  - appends one row to `results_nfr.csv` / `results_nfr_stuck.csv` / `results_nfr_cpuhog.csv`;
  - env: `AIOPS_MEMORY`, `AIOPS_ACT_GUARD`, `LABEL` (default `llm-v13` / `hpa`; `*-INVALID` rows are excluded).
    `compare_results.py` / `campaign_report.py` take `AGENT_LABEL` (default `llm-v13`; `llm-v12` for campaign-2026-11-01, `llm-v11` for campaign-2026-10-28,
    `llm-v10` for campaign-2026-10-26, `llm-v9` for campaign-2026-10-23).
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
  the three live A–I validations (23/10 v9, 26/10 v10, 27/10 v11) and on a campaign's recorded runs (`series.json`,
  controller.log, incident_log), with the previous model (`5-ml-training/v11/`) replayed on the same series as the
  reference for the first wake-up → `replay_v12_<TAG>.md` (A31 criteria 2–5; `replay_v11_*.md` = A30's, `replay_v10.md`
  = A28's); also the user's demo run of 1/11 (`archive/manual_demo_2026-11-01/series.json`). Replay times sit on the
  series' 10 s grid, so they can differ from the live log by up to 10 s. Since v13 its detector follows a pod-count change
  and its verification judges readings of post-change data only (`clean_reading`, from Prometheus, kept in
  `archive/clean_window_readings.json`; the `replay_v12_*.md` files were made with v12's logic).
- **`replay_v13.py`** (A32, A32.1): v12's detector and verification against v13's on every action of phase 2 with data
  (117), the detector after the 113 STABLE ones, the live validations (series saved as `detector_validation_series.json`
  next to each validation) and the four campaigns → `replay_v13.md`. (A32's 1 m version: `archive/a32_replay_follow/`.)
- **`inject.sh stuck|cpuhog|reset|status`:** hand testing (`thesis_notes/manual_testing.md`).
- **Prometheus keeps 10 days.** Every run's series is in its `series.json`.

## Results of the phase-2 campaigns (A31 / A30 / A29 / A27, `thesis_notes/results_summary.md`)

**`campaign-2026-11-01` (agent v12, the last measured version; v13 changes only the detector's handling of a pod-count
change, and replayed on this campaign it wakes the agent at the same moments, A32):** 4 + 4 runs per scenario, 2026-11-01 19:07 → 2026-11-02 06:48,
all 24 on AC power, none invalid.

| | HPA | Agent v12 |
|---|---|---|
| Normal load: NFR violation | 27.5 ± 55 s (0 / 110 / 0 / 0) | 72.5 ± 71 s (70 / 170 / 50 / 0), HPA < agent p = 0.19 (not significant) |
| Normal load: cost | 76.4 replica-min | 72.2 (−5.5%, permutation p = 0.014) |
| Normal load: correct provisioning | 77.2% | 84.5% |
| Stuck: recovery | never (0/4), 74% failed requests | 4/4, restart, 138 ± 63 s (230 / 120 / 110 / 90), 8.5% failed |
| Cpuhog: recovery | never (0/4), scaled to 2 pods (27.8 replica-min) | 4/4, restart, 118 ± 21 s (16.2 replica-min) |
| Faults pooled | 0/8 | 8/8 (Fisher p = 0.00008); all phase-2 campaigns: agent 33/34, HPA 0/36 |

- **v12 agent decisions:** 28 wake-ups, 25 actions (16 scale, 9 restart), all verified STABLE (A31.1: no false UNSTABLE),
  right at the first wake-up in 12/12 runs; 0 re-wakes; memory found a same-action incident at 12/12 normal-load wake-ups
  after the first run. **One unnecessary restart** (normal load, 3 pods at 210 rps, during an ingress slowdown that was
  already ending; harmless: 0 errors) and **3 wake-ups answered "No action taken"** in such slowdowns (the pods' own p95
  0.07–0.10 s). Agent time median 11 s, max 185 s; retries in 11/28, fallback in 4.
- **Where the normal-load violation comes from (A31):** at the 1→2 step it starts *after* the scale, even with a 3.5 s
  agent: the agent acts at the anomaly boundary (87–105 rps; v11 98–114, v10 100–125), when the single pod is already at
  its limit (event-loop lag up to 0.74 s), and the 1-minute window keeps the requests queued around the change in the p95
  for a minute. The HPA scales at 69–87 rps and stays below 0.35 s (14/14 runs). A slow LLM matters at 2→3 (129 s → 120 s).
- **Ingress slowdowns (new in this campaign):** with the same load the ingress p95 rose to 0.31–0.45 s for 2–3 min and came
  back by itself, while the backend's handler p95 stayed 0.07 s (event-loop lag and CPU throttling rose). They gave the
  HPA its first normal-load violation (110 s) and the agent its unnecessary restart. Cause not found; most likely the one
  machine (8 cores all given to Docker, plus k6, ingress and the VS Code of the session). 3-pod plateau median p95 was
  elevated in 2/8 runs here, 1/11 on 28/10, 0/16 on 23 and 26/10.
- The cases v12 fixed (1 pod at 1–4 rps, the 17.8–19.4 rps hole) are not in the campaign scenarios; the campaign shows no
  regression (v11: cost 72.1, correct 83.9%, cpuhog 118 s). Different days, so not a controlled comparison.

**`campaign-2026-10-28` (agent v11):** 6 + 6 runs planned; the Gemini API was down 17:01–19:56 and the
user stopped the campaign at 34/36; one battery-touched agent run relabelled `llm-v11-INVALID`. Valid runs: HPA 6, agent 5
per scenario.

| | HPA | Agent v11 |
|---|---|---|
| Normal load: NFR violation | 0 s | 60 ± 40 s (110 / 0 / 70 / 70 / 50), HPA < agent p = 0.015 |
| Normal load: cost | 76.0 replica-min | 72.1 (−5.1%, permutation p = 0.002) |
| Normal load: correct provisioning | 78.8% | 83.9% |
| Stuck: recovery | never (0/6), 74% failed requests | 5/5, restart, 114 ± 5 s, 5.8% failed |
| Cpuhog: recovery | never (0/6), scaled to 2 pods (27.8 replica-min) | 5/5, restart, 118 ± 13 s (16.2 replica-min) |
| Faults pooled | 0/12 | 10/10 (Fisher p = 1.5e-6) |

- **v11 agent decisions:** 30 actions (20 scale, 10 restart), all right at the first wake-up and verified STABLE; 0 false
  wakes; 0 re-wakes; memory found a same-action incident at 16/16 normal-load wake-ups after the first run. Agent time
  median 19 s, max 150 s; retries in 12/30, fallback in 2.
- **Normal-load violation** still mostly follows the agent's time at the first scale-up (7 s → 0 s; 67–80 s → 50–110 s);
  one fast run had 70 s of marginal p95 (0.35–0.39 s) around the pod changes.

**`campaign-2026-10-26` (agent v10) and `campaign-2026-10-23` (agent v9)**, 4 + 4 runs per scenario, each against the HPA
in the same campaign:

| | HPA (v10 campaign) | Agent v10 | Agent v9 |
|---|---|---|---|
| Normal load: NFR violation | 0 s | 82.5 ± 75 s (130 / 160 / 0 / 40) | 108 ± 25 s |
| Normal load: cost | 76.1 replica-min | 72.3 (−5.0%, permutation p = 0.014) | 71.5 (HPA 76.3) |
| Normal load: correct provisioning | 78.5% | 81.6% | 83.3% |
| Stuck: recovery | never (0/4) | 4/4, restart, 165 ± 71 s | 4/4, 138 s |
| Cpuhog: recovery | never (0/4), scaled to 2 pods | 4/4, restart, 158 ± 57 s | 3/4, 113 s; the 4th lost to a stalled LLM provider |
| Faults pooled | 0/8 | 8/8 (Fisher p = 0.00008) | 7/8 |

- **v10 agent decisions:** 24 actions (16 scale, 8 restart), all right at the first wake-up and verified STABLE; 0 false
  wakes (v9: 1 of 25, correctly declined); 0 re-wakes.
- **The LLM provider sets the spread:** on the normal load the NFR violation follows the agent's time at the first
  scale-up (18 s → 0 s violation, 261 s → 160 s); the detector woke at the same point every run (481–491 s). In the faults,
  recovery minus the agent's time is 87–112 s (v9: 64–111 s). Retries in 19/24 wake-ups, fallback model in 7 (v9: 12/24,
  2): the provider was slower on 26/10 than on 23/10, so the v10 / v9 comparison is not controlled.
- **Why the agent has NFR violation on normal load:** it reacts at the anomaly boundary, plus LLM time. The HPA scales
  ahead with headroom and pays for it in cost. The difference is no longer significant for v10 (p = 0.071; v9 0.014).
- **Invalid runs:** two (charger dropped for 26 s and 43 s), relabelled `*-INVALID` and repeated after the campaign
  (`archive/campaign_followup_2026-10-26.sh`).
- **Limits:** LLM provider dependency, latency below 0.25 s invisible to the model (A28.1), no live UNSTABLE in a campaign
  (only in the v12 UNSTABLE test), shallow liveness by design, small n, one machine (v12: ingress slowdowns; the
  verification judges the state, not whether the action caused it, so the unnecessary restart was STABLE). Fixed in v12 (A31): v11 called 1 pod at 1–3.9 rps and at
  17.8–19.4 rps an anomaly, and its facts then suggested 3 pods (never reached in a measured run). v12's own: γ 0.1
  tolerates p95 up to ~0.33 s in the middle of the 1-pod band before it calls an anomaly; 1 pod at 1.000–1.002 rps is
  still marginally anomalous (the minimum is 1 there).

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
- Tests: `.venv/bin/python3 -m pytest 3-ai-agent/tests -q` (102: detector loop, post-change readings and the follow of a
  pod-count change, tools and guards, facts, the system prompt and the incident message, one code format, the judgement of a change with its noise, the factorisation the range probes rely on, memory, CodeAgent replays; everything external mocked).
- Backend: `cd 2-target-app/software-backend && npm test` (Jest, 812).
- After changing the backend: `docker build -t aiops-backend:latest 2-target-app/software-backend/ && kind load docker-image aiops-backend:latest --name aiops-cluster && kubectl rollout restart deployment/aiops-backend-deployment`.

## Conventions / notes
- Comments and log messages mix Greek and English. That's fine; the user is Greek.
- Never read or print `.env` values (they hold HF / Gemini / OpenRouter keys).
- The code keeps only the final version. Removed things are recorded in `thesis_notes/removed_and_archived.md`, decisions
  in `design_decisions.md`.
- `thesis_notes/history/phase1/THESIS_SUMMARY_EN.md` holds the research framing of phase 1.

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
