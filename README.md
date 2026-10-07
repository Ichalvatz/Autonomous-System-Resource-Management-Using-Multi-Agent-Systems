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

```
Prometheus ──(5 metrics / 10 s)──▶ anomaly_detector.py ──(3 anomalous readings in a row)──▶ agent.py
  (CPU/pod, rps, p95, throttling,      One-Class SVM per            prompt = metrics + capacity table
   replicas)                           replica count                + 2 nearest verified past incidents
                                                                              │ LLM (Gemini, smolagents)
                                                                              ▼
                                       ChromaDB ◀── save if STABLE ── verify (code) ◀── scale / restart / read logs
                                                                     rollback failed scale-downs   (guarded tools)
```

**Agent versions** (`AIOPS_PROMPT`, all kept for reproducibility):

| Version | Tools | What the prompt adds | Status |
|---|---|---|---|
| v4 | logs, scale, rolling restart | "find the bottleneck first" | measured 2026-10-01 |
| v5 | same | a code-computed "CPU cost per request = N× healthy" hint | measured 2026-10-01 |
| v6 | **per-pod view, deployment history, logs; scale, rolling restart, restart one pod, rollback** | investigate → act on the cause; its own recent actions and their verdicts; no fault-specific hint | frozen 2026-10-03, blind-tested |
| v7 | same as v6 | classify first (code-computed facts: minimum replicas, CPU per request): capacity → v4's scaling tiers; anything else → v6's investigation; two code-enforced guards (evidence before action, no claimed action without a tool call) | 2026-10-03 |
| **v8 (final, default)** | same as v6 | v7 + a third guard, *diagnosis before a disruptive action* (restart / pod restart / rollback only after all three observation tools) + evidence-based restart (check what changed first; symptom-only warnings are not evidence) | 6/6 scenario runs right at the first wake-up (2026-10-03/04) |

**Scenarios** (`SCENARIO`): `baseline` (normal 40-min demo load), `stuck` (leaked DB pool: restart fixes it),
`cpuhog` (runaway background job: restart fixes it), `badconfig` (a bad configuration deployed: only a rollback fixes it).
**Baselines:** Kubernetes HPA, rules (the agent's scaling tiers as thresholds), rules v2 (`RULES_RESTART=on`: plus
restart rules written after seeing the stuck and cpuhog faults), static 1 / 3 replicas.

| Folder | Contents |
|---|---|
| `1-infrastructure/` | kind cluster, kube-prometheus-stack values, ServiceMonitor, ingresses, ChromaDB |
| `2-target-app/` | The managed system: Node.js backend (with `/chaos/stuck` and `/chaos/cpuhog` fault injection) and React frontend |
| `3-ai-agent/` | Detector, agent, guarded tools, rule-based baseline, unit tests |
| `4-load-testing/` | k6 scenarios, experiment harness (`run_experiment.sh`), scoring (`evaluate_run.py`), results (`comparison.md`) |
| `5-ml-training/` | Capacity discovery, healthy-data collection, One-Class SVM training |

## Quick start

```bash
./deploy.sh                                        # kind cluster + monitoring + app + ChromaDB
source .venv/bin/activate && export GEMINI_API_KEY=...
python 3-ai-agent/anomaly_detector.py --dry-run    # detector only, no LLM, no cluster changes
python 3-ai-agent/anomaly_detector.py              # detector + agent, final version v8 (run from the repo root)
./4-load-testing/run_experiment.sh llm             # one scored experiment (also: rules, hpa, static-1, static-3)
SCENARIO=stuck ./4-load-testing/run_experiment.sh llm    # fault experiment (also SCENARIO=cpuhog, badconfig)
AIOPS_PROMPT=v6 AIOPS_MEMORY=off SCENARIO=badconfig LABEL=llm-v6 ./4-load-testing/run_experiment.sh llm
RULES_RESTART=on SCENARIO=cpuhog LABEL=rules-v2 ./4-load-testing/run_experiment.sh rules
python 4-load-testing/compare_results.py           # tables, statistics and timeline figures
.venv/bin/python3 -m pytest 3-ai-agent/tests -q    # unit tests (all external systems mocked)
```

Results are in `4-load-testing/comparison.md`; design decisions and their evidence in `CLAUDE.md` and
`thesis_notes/design_decisions.md`.

**Documentation (Greek):**
- `thesis_notes/study_guide.md`: the whole system from theory to code (Kubernetes, Prometheus/PromQL, One-Class SVM,
  the LLM agent and its guards, scenarios, baselines, evaluation and statistics, code map, glossary).
- `thesis_notes/manual_testing.md`: how to run and check every scenario by hand, with exact commands.
- `thesis_notes/defense_qa.md`: likely examiner questions with honest answers and evidence.
- `NOTES_2026-10-03.md`: the log of the v6/v7/v8 work (every change, result and mistake).

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