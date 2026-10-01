# English Summary for the Thesis Project

## Translated Thesis Description

This thesis project aims to design and implement an autonomous agent that acts as a manager of available resources in cloud-computing or containerized environments (CPU, memory, I/O). Unlike traditional resource-management systems that rely on static rules and thresholds, the proposed approach uses the reasoning capabilities of Large Language Models (LLMs) to understand the dynamic state of the system and perform corrective actions in real time. Both system monitoring and resource-management actions are carried out using a set of functions and tools provided to the agent.

## What This Repository Does

This repository implements an AIOps-style prototype for autonomous resource management. It combines:

- A target application deployed in Kubernetes.
- Prometheus-based observability and metric collection.
- An anomaly-detection model trained with Isolation Forest.
- An LLM-powered agent that interprets anomalies and can trigger scaling actions.
- A knowledge base stored in ChromaDB for storing previous resolved incidents.

## End-to-End Workflow

1. The backend application is deployed in Kubernetes.
2. Prometheus scrapes operational metrics such as CPU usage, memory usage, throughput, latency, error rate, and replica count.
3. A baseline anomaly-detection model is trained from normal system behavior.
4. The monitoring script continuously queries Prometheus and applies the trained model to detect anomalies.
5. When an anomaly is detected, the agent receives the metrics and uses LLM reasoning to decide on a corrective action.
6. The agent can inspect logs, query a knowledge base, and scale the Kubernetes deployment.
7. Successful resolutions are stored in ChromaDB for future reuse.

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
