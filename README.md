# Autonomous System Resource Management Using Multi-Agent Systems

## Description
This repository contains the design and implementation of an autonomous AI agent designed to manage available system resources (CPU, Memory, I/O) within cloud computing or containerized environments. 

Traditional management systems rely on static rules and predefined thresholds. In contrast, this project leverages Large Language Models (LLMs) to dynamically comprehend the real-time state of the system and execute autonomous corrective actions. System monitoring and resource allocation tasks are orchestrated via a structured framework of provided functions and tools.

---

## Desired Knowledge
* **Languages:** Python
* **Concepts:** Large Language Models (LLMs), Software Engineering
* **Containerization:** Docker

---

## Key Technologies & Skills Acquired
* **Agentic AI**
* **Observability & Monitoring**

---

## Project Parameters
* **Estimated Duration:** 9 months
* **Collaborating Researchers:** Eleftherios Kalaitzidis, Dimosthenis Natsos
* **Supervisor:** Prof. Andreas L. Symeonidis

---

## How it works (implementation)

The system is built around the service's **non-functional requirements** (NFRs): p95 latency < 0.35 s and errors < 1%,
measured at the ingress as users see them, with at most 3 pods (phase 2 since 2026-10-22; current code **agent v13**, branch `nfr-v13`, not measured
yet: v12 with the detector judging every reading after a pod-count change; last measured **agent v12**, campaign-2026-11-01, tag `v12-campaign`; earlier: v11 `v11-campaign`, v10 `v10-campaign`, v9 `v9-campaign`; phase 1, the CPU-based design with prompts v3–v8, is git tag `v8.1-campaign`).

```
k6 (open-model load, 7-endpoint request mix) ──▶ ingress-nginx ──▶ backend pods (1–3, readiness + liveness probes)
                                                   │ NFR metrics          │ per-pod metrics, logs
                                                   ▼                      ▼
                                                Prometheus ──(every 10 s)──▶ anomaly_detector.py
                                                                  ONE One-Class SVM (load, p95, errors, pods)
                                                                              │ 3 anomalous readings in a row
                                                                              ▼
              ChromaDB ◀── save ── verify: follow the SVM score ◀── agent.py (Gemini, smolagents CodeAgent)
            (model-space            (STABLE / UNSTABLE → re-wake)     facts + capacity + 2 similar incidents
             embeddings)                                             tools: pod breakdown, history, logs; scale, restart
```

- **Detector:** one One-Class SVM trained on healthy traffic only, with its inputs in NFR units (latency and errors:
  0 = safe level, 1 = objective; no tuned weights) and the pod count as an input. Its score reads as a distance from
  healthy. Its acceptance tests are ranges that cover every case (one healthy load interval per pod count, the NFRs
  anomalous at every load). It wakes the agent after 3 anomalous readings in a row, and again at once if the verification says the state
  got worse or is not improving. It judges every reading, also right after a pod-count change: a change no verification
  watched is followed with the verification's rule (v13).
- **Agent (v12 / v13):** code computes the facts (the minimum pod count the health model calls healthy, and the load trend). The LLM classifies capacity
  vs something else, investigates with three observation tools, and acts: scale or a rolling restart. Three
  code-enforced guards apply: evidence before action, no claimed action without a tool call, full diagnosis before a
  restart.
- **Verification:** by code, from the trajectory of the SVM score: "worse" judged from 10 s after the rollout, "not
  improving" from 60 s (once the 1-minute windows hold only post-action data).
- **Memory:** ChromaDB with the model's feature vector as embedding.
- **Comparison:** the native Kubernetes HPA (CPU 60%, from the same capacity measurement), with the same probes.
- **Scenarios:**
  - normal load (1→2→3→2→1 pods);
  - `stuck` (leaked DB pool: 503s, the pod leaves the Service; only a restart fixes it);
  - `cpuhog` (a runaway job blocks the event loop; only a restart fixes it).

**Results (campaign-2026-11-01, agent v12; 4 + 4 runs per scenario, all valid):**
- **Faults:** the agent recovered in 8/8 runs (stuck in 138 s, cpuhog in 118 s, by a rolling restart at the first
  wake-up); the HPA in 0/8 (Fisher p = 0.00008). Across all phase-2 campaigns: agent 33/34, HPA 0/36.
- **Normal load:** the agent is 5.5% cheaper (72.2 vs 76.4 replica-min, p = 0.014) and better provisioned (84.5% vs 77.2%),
  but spends 72.5 s outside the NFRs (HPA 27.5 s; not significant, p = 0.19). Most of it follows the first scale-up: the
  agent acts at the anomaly boundary, when the single pod is already at its limit.
- 25 agent actions, all verified STABLE; 24 right and 1 unnecessary but harmless restart during a short slowdown of the
  ingress that also hit an HPA run (one machine runs everything).
- Details: `thesis_notes/results_summary.md` and `4-load-testing/comparison_nfr.md`; earlier versions in
  `thesis_notes/history/`.

| Folder | Contents |
|---|---|
| `1-infrastructure/` | kind cluster, kube-prometheus-stack values, ServiceMonitors (backend, ingress-nginx), ingresses, ChromaDB |
| `2-target-app/` | The managed system: Node.js backend (generated catalogue, `/ready`, `/chaos/stuck`, `/chaos/cpuhog`) and React frontend |
| `3-ai-agent/` | NFR metrics, health model, detector, agent, guarded tools, unit tests |
| `4-load-testing/` | k6 request mix and scenarios, experiment harness (`run_experiment.sh`), scoring, campaign scripts and reports |
| `5-ml-training/` | NFR capacity discovery, healthy-data collection, One-Class SVM training (`phase1/`: the phase-1 pipeline) |

## Quick start

```bash
./deploy.sh                                        # kind cluster + monitoring + ingress metrics + app + ChromaDB
source .venv/bin/activate && export GEMINI_API_KEY=...
python 3-ai-agent/anomaly_detector.py --dry-run    # detector only, no LLM, no cluster changes
python 3-ai-agent/anomaly_detector.py              # detector + agent v13
./4-load-testing/run_experiment.sh llm             # one scored experiment on the normal load (also: hpa)
SCENARIO=stuck ./4-load-testing/run_experiment.sh llm    # fault experiment (also SCENARIO=cpuhog)
./4-load-testing/full_campaign.sh my-campaign      # the whole agent-vs-HPA comparison (~14 h)
python 4-load-testing/compare_results.py my-campaign     # tables, statistics and timeline figures
.venv/bin/python3 -m pytest 3-ai-agent/tests -q    # unit tests (all external systems mocked)
```

**Documentation (Greek, `thesis_notes/`; start at `thesis_notes/README.md`, the reading order and the version map):**
- `presentation.md`: the system for a first-time reader, with diagrams and two real incidents step by step.
- `results_summary.md`: the current results on one page.
- `system_overview.md`: the whole picture in one place: what we had, what changed and why, how it works now, results.
- `study_guide.md`: the system from theory to code (Kubernetes, probes, Prometheus, NFRs, One-Class SVM, the agent and its
  guards, verification, memory, scenarios, HPA, evaluation and statistics, code map, glossary).
- `defense_qa.md`: likely examiner questions with honest answers and evidence.
- `design_decisions.md`: every decision with its evidence (A24–A30: phase 2; index newest first); `phase2_worklog.md`: the phase-2 log.
- `manual_testing.md`: how to run and check every scenario by hand.
- `history/`: the summaries of earlier versions (v10, v9) and phase 1 (results, study guide, defense Q&A, early notes).

**Python environment:** `python3.13 -m venv .venv && .venv/bin/pip install -r requirements.txt`.

---

## References & Links
* **Research Paper:** [IEEE DOI: 10.1109/CSITSS67709.2025.11295499](https://doi.org/10.1109/CSITSS67709.2025.11295499)
* **Educational Resource:** [Hugging Face Agents Course - Unit 1](https://huggingface.co/learn/agents-course/unit1)

14 | Αυτόνομη διαχείριση πόρων συστημάτων με χρήση πρακτόρων 
Περιγραφή: Η παρούσα διπλωματική εργασία στοχεύει στη σχεδίαση και υλοποίηση ενός αυτόνομου πράκτορα (Agent), ο οποίος θα λειτουργεί ως διαχειριστής των διαθέσιμων πόρων σε περιβάλλοντα υπολογιστικού νέφους ή containerized περιβάλλοντα (CPU, Μνήμη, I/O). Σε αντίθεση με τα παραδοσιακά συστήματα διαχείρισης που βασίζονται σε στατικούς κανόνες και κατώφλια (thresholds), η προτεινόμενη μέθοδος αξιοποιεί τη λογική των Μεγάλων Γλωσσικών Μοντέλων (LLMs) για να κατανοεί τη δυναμική κατάσταση του συστήματος και να προβαίνει σε διορθωτικές ενέργειες σε πραγματικό χρόνο. Τόσο η παρακολούθηση του συστήματος όσο και οι ενέργειες διαχείρισής του θα γίνονται αξιοποιώντας ένα σύνολο από συναρτήσεις και εργαλεία που του παρέχονται.
Επιθυμητές γνώσεις: Python, LLMs, Docker, Software Engineering
Εμπλεκόμενες Τεχνολογίες - Γνώσεις που θα αποκτηθούν: Agentic AI, Observability
Εκτιμώμενος Χρόνος Περάτωσης: 9 μήνες
Συνεργαζόμενοι Ερευνητές: Ελευθέριος Καλαϊτζίδης, Δημοσθένης Νάτσος
Υπεύθυνος Καθηγητής: Andreas L. Symeonidis
Σχετικά links:
https://doi.org/10.1109/CSITSS67709.2025.11295499
https://huggingface.co/learn/agents-course/unit1