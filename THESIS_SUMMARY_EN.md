# English Summary for the Thesis Project

## Translated Thesis Description

This thesis project aims to design and implement an autonomous agent that acts as a manager of available resources in cloud-computing or containerized environments (CPU, memory, I/O). Unlike traditional resource-management systems that rely on static rules and thresholds, the proposed approach uses the reasoning capabilities of Large Language Models (LLMs) to understand the dynamic state of the system and perform corrective actions in real time. Both system monitoring and resource-management actions are carried out using a set of functions and tools provided to the agent.

## What This Repository Does

This repository implements an AIOps-style prototype for autonomous resource management. It combines:

- A target application deployed in Kubernetes (Node.js backend, 1 core per pod, 1–3 replicas).
- Prometheus-based observability: five features (CPU per pod, throughput, p95 latency, CPU throttling, replicas).
- An anomaly detector: one One-Class SVM per replica count, trained only on healthy data (it replaced an
  Isolation Forest on 2026-09-30, which could not tell *how far* a reading was outside the healthy range).
- An LLM agent (smolagents CodeAgent + Gemini) that investigates the anomaly with observation tools (per-pod view,
  deployment history, logs) and acts through safety-guarded tools: scale, rolling restart, restart one pod, rollback
  (fixed target, 1–3 replicas, ±2 per call, cooldowns). Final version: prompt v8 (2026-10-04).
- Code around the LLM: verification of every action against the SLO, automatic rollback of failed scale-downs,
  an incident memory in ChromaDB (nearest past incidents by metric distance, only verified fixes are stored), and
  three behaviour guards (evidence before action; no claimed action without a tool call; full diagnosis before a
  restart or rollback).

## End-to-End Workflow

1. Prometheus scrapes the backend (`/metrics`) and cAdvisor / kube-state-metrics.
2. The monitor (`3-ai-agent/anomaly_detector.py`) reads the five features every 10 s and scores them with the
   One-Class SVM for the current replica count (too much load, too little, or abnormal latency all score as anomalies).
3. After 3 anomalous readings in a row, it wakes the agent with the metrics, code-computed facts (minimum replica
   count for the load, CPU per request vs healthy), the two most similar verified past incidents and its own
   actions of the last 15 minutes with their verdicts.
4. The LLM classifies the problem: capacity (traffic explains it → scale to the minimum that fits) or anything else
   (investigate: per-pod view → what changed → logs; then act on the cause: rollback a bad change, restart a bad
   process state, or no action for a transient).
5. Code waits for the rollout, re-measures, and judges the action STABLE / UNSTABLE; a failed scale-down is
   rolled back, a STABLE fix is stored in memory. Every run is logged to `3-ai-agent/incident_log.csv`.

## Strengths of the Project

- The project combines classical monitoring with modern AI-driven decision-making.
- It demonstrates a practical use case for LLMs in operations and autonomous systems.
- The architecture is modular and allows future extension with more tools and policies.
- It is suitable for a master’s thesis because it addresses a real and relevant problem in cloud operations.

## What I Would Improve for a Stronger Thesis

### 1. Strengthen the research question
The thesis should define a clear and testable research question, such as:

- Does an LLM-based agent outperform static threshold-based autoscaling in dynamic workloads?
- Can retrieval-augmented reasoning improve incident resolution quality compared with pure prompt-based actions?

### 2. Add a rigorous evaluation methodology
The current prototype is promising, but the thesis should include measurable evaluation criteria such as:

- Mean time to recovery (MTTR)
- False-positive rate
- Scaling accuracy
- Cost of LLM calls
- Stability under repeated incidents

### 3. Compare against strong baselines
A stronger evaluation would compare the agent against:

- Threshold-based autoscaling
- Rule-based remediation systems
- Classical anomaly-detection-only approaches

### 4. Improve the agent decision logic
The current logic is useful for a prototype, but the next step would be to make decisions more robust by adding:

- Confidence scoring
- Action validation before execution
- Rollback logic when remediation fails
- Multi-step reasoning and root-cause analysis

### 5. Add formal experimentation
The thesis would become much stronger with a reproducible experiment setup, for example:

- Synthetic workload injection
- Real traffic spikes
- Multiple failure scenarios
- Repeated trials and statistical reporting

### 6. Improve the engineering quality
The project would benefit from:

- Unit and integration tests
- Better configuration management
- Logging and tracing for each agent action
- Containerized deployment for the monitoring and agent services
- Clear separation between inference, policy, and execution layers

## Suggested Thesis Framing

A strong thesis title could be:

- Autonomous Cloud Resource Management Using LLM-Based Agents
- A Retrieval-Augmented Agent for AIOps and Kubernetes Autoscaling
- LLM-Driven Incident Response for Containerized Systems

## Final Assessment

This repository is a solid proof of concept for an LLM-driven autonomous operations system. For a master’s thesis, the main opportunity is to evolve it from a demonstrator into a well-evaluated research artifact with clear hypotheses, baselines, and experimental evidence.

## Status of the TODO items (2026-10-01)
Added by Claude after the overnight and day experiments; details in `NOTES_2026-10-01_DAY.md` and
`4-load-testing/OVERNIGHT_REPORT_2026-10-01.md`.

- **Rigorous evaluation (§2):** `4-load-testing/run_experiment.sh` + `evaluate_run.py` score every run the same way:
  SLO-violation seconds, recovery time (MTTR) after a fault, replica-minutes (cost), scaling accuracy vs the capacity
  table, scale actions, LLM calls. Repeated runs (n = 2–4 per strategy), mean ± std in `comparison.md`.
- **Baselines (§3):** Kubernetes HPA (CPU 70%), a rule-based scaler with the same information and gates as the agent,
  static 1 and static 3 replicas.
- **Results so far:**
  - Scaling (demo load): every autoscaler kept 0 s SLO violation; the agent was the cheapest (71.6 replica-min vs
    HPA 79.5, rules 78.2, static-3 114.5) and the most accurately provisioned (86% vs 69% / 77%), but reacted slowest
    to CPU pressure that users did not notice.
  - Failure beyond scaling (stuck dependency): agent recovered in ~100 s (4/4 with the final prompt); HPA, rules and
    static never recovered (710 s violation each); rules tripled the cost.
- **Decision logic (§4):** verification of every action by code, automatic rollback of failed scale-downs, metric-based
  incident memory, retries for LLM outages (Gemini 503s happened several times and were absorbed).
- **Engineering (§6):** 37 unit tests (`3-ai-agent/tests`), structured per-incident log (`3-ai-agent/incident_log.csv`).
- **Research question 2 (RAG):** ablation done for the stuck fault: memory off recovered in 100 / 100 s with 2–3 LLM
  calls, the same as memory on (mean 100 s, 2.75 calls). No measurable effect for this incident type (the prompt
  and the logs are enough); a fault the logs do not explain would be the next test.
- **Generalization (blind test, 2026-10-01 evening):** a second fault, a runaway background job that burns CPU
  (`/chaos/cpuhog`), designed after the final prompt was frozen. The agent did **not** generalize: it treated the CPU
  saturation as load (scale up), then, once the server-side latency looked healthy, as waste (scale down, rolled
  back by the verification code). Rules and HPA did not recover either. Root cause: the in-app latency histogram
  cannot see requests queued behind a blocked event loop, and the agent is not shown CPU per request or event-loop
  lag, two signals that separate this fault from overload cleanly. A prompt with CPU per request (v5) is under test.
  Thesis framing: the LLM generalizes *reasoning* (bottleneck first, logs, restart) but only over the evidence it
  is given; observability design is a first-class part of an LLM operator.
- **Statistics:** exact tests only (n = 1–5 per arm). Stuck-fault recovery 9/9 LLM vs 0/5 baselines, Fisher
  p = 0.0005. Scaling cost LLM < HPA and LLM < rules, permutation p = 0.048 each (the minimum possible with 5 vs 2
  runs; one more HPA and rules run would allow p < 0.02).
- **Research question 2 (RAG), revised 2026-10-01 23:55:** memory had no effect where prompt + logs sufficed (stuck fault),
  but **carried a diagnosis the prompt lacked**: prompt v4 on the cpuhog fault fixed it 0/2 times with no similar memory and
  2/2 (restart at the first wake-up) once memory held verified restarts, and 3/3 in a repeat where memory was reset to the
  same snapshot before every run (independent; Fisher p = 0.10 vs 0/2). It also showed the risk: one run acted on memory alone without reading the logs.

## Status (2026-10-04, final): experiments complete
Supersedes the 2026-10-01 numbers above where they differ; full log in `NOTES_2026-10-03.md`, one-page summary in
`thesis_notes/results_summary.md`, all tables in `4-load-testing/comparison.md`.

- **Agent versions:** v6 replaced the code-computed hint of v5 with investigation tools (frozen 2026-10-03 14:28);
  v7 added a classify step and two code guards; **v8 (final, default)** added a third guard (full diagnosis before a
  disruptive action). Since 2026-10-10 only v8 is in the code; v4–v7 are in git (commit `a1fd3d5`,
  see `thesis_notes/removed_and_archived.md`).
- **v8:** 6/6 scenario runs right at the first wake-up (demo ×2: 4/4 scaling actions, 0 s SLO violation, 71.0 / 71.7
  replica-min; stuck restart 120 s; cpuhog restart 130 s; badconfig rollback ×2, 160 / 110 s).
- **Blind generalization test (badconfig, designed after v6 was frozen):** agents with investigation tools recovered
  7/7 (v6 ×3, v7 ×2, v8 ×2); everything else 0/5 (v4, v5, rules, rules-v2, HPA). Fisher exact p = 0.0013. Rules
  written for the known faults (rules-v2) matched the signature but not the cause: 11 useless restarts.
- **Cost (normal load):** the agent's capacity tiers (v3/v4/v7/v8, n = 9) 71.5 replica-min vs HPA 79.5 (n = 3,
  permutation p = 0.005) and rules 76.5 (n = 4, p = 0.001; a small difference, −6.5%).
- **Stuck fault:** all LLM versions 13/13 vs baselines 1/6 (only rules-v2, written after seeing it), p = 0.0005.
- **Engineering:** 71 unit tests (74 before the old prompt versions were removed); `requirements.txt`; fallback LLM (`gemini-2.5-flash`, after all measurements).
- **Limits (stated first):** n = 1–2 per scenario for v7/v8; v7/v8 were designed after seeing all four scenarios
  (only v4 on cpuhog and v6 on badconfig are blind); one laptop node, at most 3 pods, closed-loop load, one LLM provider.
- **Open:** a blind fault for v8 designed by someone other than the agent's designer (`thesis_notes/manual_testing.md`
  §7); the written thesis.
