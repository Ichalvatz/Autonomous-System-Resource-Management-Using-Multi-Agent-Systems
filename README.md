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
measured at the ingress as users see them, with at most 3 pods (phase 2, branch `nfr-v9`, since 2026-10-22; phase 1, the
CPU-based design with prompts v3–v8, is git tag `v8.1-campaign`).

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

- **Detector:** one One-Class SVM trained on healthy traffic only; the pod count is one of its inputs. It wakes the agent
  after 30 s of anomaly, and again at once if the verification says the state got worse.
- **Agent v9:** code computes the facts (minimum pod count with headroom and the load trend). The LLM classifies capacity
  vs something else, investigates with three observation tools, and acts: scale or a rolling restart. Three
  code-enforced guards apply: evidence before action, no claimed action without a tool call, full diagnosis before a
  restart.
- **Verification:** by code, from the trajectory of the SVM score.
- **Memory:** ChromaDB with the model's feature vector as embedding.
- **Comparison:** the native Kubernetes HPA (CPU 60%, from the same capacity measurement), with the same probes.
- **Scenarios:**
  - normal load (1→2→3→2→1 pods);
  - `stuck` (leaked DB pool: 503s, the pod leaves the Service; only a restart fixes it);
  - `cpuhog` (a runaway job blocks the event loop; only a restart fixes it).

**Results (campaign-2026-10-23, 4 + 4 runs per scenario):**
- **Normal load:** the agent is 6.3% cheaper (71.5 vs 76.3 replica-min, p = 0.014) but has 108 s of NFR violation at the
  first scale-up; the HPA has 0 s.
- **Faults:** the agent recovered in 7/8 runs (stuck 4/4 in 138 s, cpuhog 3/4 in 113 s; the 4th was lost to a stalled LLM
  provider). The HPA recovered in 0/8.
- Details: `thesis_notes/results_summary.md` and `4-load-testing/comparison_nfr.md`.

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
python 3-ai-agent/anomaly_detector.py              # detector + agent v9
./4-load-testing/run_experiment.sh llm             # one scored experiment on the normal load (also: hpa)
SCENARIO=stuck ./4-load-testing/run_experiment.sh llm    # fault experiment (also SCENARIO=cpuhog)
./4-load-testing/full_campaign.sh my-campaign      # the whole agent-vs-HPA comparison (~14 h)
python 4-load-testing/compare_results.py my-campaign     # tables, statistics and timeline figures
.venv/bin/python3 -m pytest 3-ai-agent/tests -q    # unit tests (all external systems mocked)
```

**Documentation (Greek, `thesis_notes/`):**
- `system_overview.md`: the whole picture in one place: what we had, what changed and why, how it works now, results.
- `study_guide.md`: the system from theory to code (Kubernetes, probes, Prometheus, NFRs, One-Class SVM, the agent and its
  guards, verification, memory, scenarios, HPA, evaluation and statistics, code map, glossary).
- `defense_qa.md`: likely examiner questions with honest answers and evidence.
- `design_decisions.md`: every decision with its evidence (A24–A27: phase 2); `phase2_worklog.md`: the phase-2 log.
- `manual_testing.md`: how to run and check every scenario by hand.
- Phase 1: `results_summary_phase1.md`, `study_guide_phase1.md`, `defense_qa_phase1.md`.

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