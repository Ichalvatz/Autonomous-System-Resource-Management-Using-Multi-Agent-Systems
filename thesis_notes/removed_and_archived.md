# Τι αφαιρέθηκε ή αρχειοθετήθηκε (2026-10-10)

Στόχος: στα αρχεία του repo μένει **μόνο η τελική έκδοση** (agent v8). Τίποτα δεν χάθηκε:
- ό,τι ήταν **κώδικας** παλιών εκδόσεων είναι στο git, στο commit **`a1fd3d5`** (2026-10-07, το τελευταίο πριν από
  την αφαίρεση)·
- ό,τι ήταν **δεδομένα ή απόδειξη** μεταφέρθηκε στο `4-load-testing/archive/` (ευρετήριο: `archive/README.md`).

Ένα παλιό αρχείο το βλέπεις με `git show a1fd3d5:<διαδρομή>`, π.χ. `git show a1fd3d5:3-ai-agent/agent.py`.

---

## 1. Κώδικας παλιών εκδόσεων του agent (αφαιρέθηκε)

| Τι | Πού ήταν | Τι το έκανε |
|---|---|---|
| Prompts v4, v5, v6, v7 | `3-ai-agent/agent.py`: `_prompt_v4_v5`, `V5_DERIVED_SECTION`, `_cpu_per_request_context`, `V6_PROMPT`, `V7_PROMPT` | επέτρεπαν να ξανατρέξει κάθε μετρημένη έκδοση |
| Διακόπτης `AIOPS_PROMPT` και τρία διαφορετικά σύνολα tools | `agent.py` | v4/v5: logs, scale, restart (`max_steps=6`)· v6: τα 7 tools χωρίς φραγμούς· v7: τα 7 tools + 2 φραγμούς |
| Παράμετρος `require_diagnosis` | `agent_tools.guard_start` | ο φραγμός διάγνωσης ίσχυε μόνο στο v8· τώρα ισχύει πάντα όταν οι φραγμοί είναι ενεργοί |
| Ανάγνωση μνήμης παλιάς μορφής | `agent_tools`: `_SIGNATURE_RE`, `_SIGNATURE_P95_RE`, κομμάτια των `_incident_features` / `_metric_distance` / `query_knowledge_base` | εγγραφές της ChromaDB χωρίς μετρικές (πριν από 2026-10-01): οι μετρικές διαβάζονταν από το κείμενο της υπογραφής, +3 απόσταση όταν έλειπε το p95. Τώρα κάθε εγγραφή χωρίς μετρικές **αγνοείται** (η μνήμη είναι άδεια και κάθε νέα εγγραφή έχει μετρικές). Η `query_knowledge_base` παίρνει πλέον μόνο τις μετρικές |
| `_validate_target` | `agent_tools.py` | αχρησιμοποίητη |
| Tests των παλιών prompts | `tests/test_agent_logic.py`, `tests/test_v7.py`, `tests/test_v8.py` | `test_v6_prompt_has_no_fault_specific_hint`, `test_cpu_per_request_separates_runaway_job_from_overload` (v5), `test_default_prompt_is_v8`, το v7 κομμάτι του `test_diagnosis_rule_is_v8_only…`. Τα tests των φραγμών και τα 3 replays πραγματικών περιστατικών **έμειναν**, ενωμένα στο `tests/test_final_agent.py` |
| Labels εκδόσεων στο `run_experiment.sh` | `llm` = v4, `llm-<prompt>` | default label του agent πλέον `llm-v8` |

**Τι ΔΕΝ άλλαξε στον agent με το καθάρισμα της 10/10 (ελέγχθηκε):** το prompt του v8 είναι byte-identical με το μετρημένο· τα 7 tools
(κώδικας και docstrings) είναι ίδια στο AST· ίδια σειρά tools, `max_steps=10`, ίδιοι φραγμοί και επαλήθευση. Το system
prompt και το task prompt που βλέπει το LLM βγήκαν **ταυτόσημα** πριν και μετά. Unit tests: 71/71.
*Στις 2026-10-11 άλλαξαν **σκόπιμα** τα docstrings 4 tools (agent v8.1, `design_decisions.md` Α20): από τότε τα tools
δεν είναι πια ίδια με τα μετρημένα· οι παλιές περιγραφές είναι στο `a1fd3d5`.*

**Οργάνωση του `agent_tools.py`:** στην κορυφή υπάρχει πίνακας με τα 7 tools, και το αρχείο ακολουθεί τη σειρά
ρυθμίσεις → βοηθητικά → tools παρατήρησης (1–3) → tools ενέργειας (4–7) → φραγμοί → επαλήθευση → μνήμη.

### Πώς ξανατρέχεις μια παλιά έκδοση (αναπαραγωγή)
Σε ξεχωριστό φάκελο, ώστε να μην αγγίξεις τον κώδικα της τελικής:
```bash
git worktree add ../LLM_AGENT_a1fd3d5 a1fd3d5           # αντίγραφο του repo όπως ήταν στις 2026-10-07
cd ../LLM_AGENT_a1fd3d5
ln -s ../LLM_AGENT/.venv .venv                           # το ίδιο Python περιβάλλον
cp ../LLM_AGENT/5-ml-training/health_model.pkl 5-ml-training/   # το μοντέλο δεν είναι στο git
export GEMINI_API_KEY=...
AIOPS_PROMPT=v4 AIOPS_MEMORY=off SCENARIO=cpuhog LABEL=llm ./4-load-testing/run_experiment.sh llm
cd ../LLM_AGENT && git worktree remove ../LLM_AGENT_a1fd3d5    # όταν τελειώσεις
```
Τα αποτελέσματα γράφονται στο `4-load-testing/` **του αντιγράφου**. (Δεν το έχω δοκιμάσει ολόκληρο.)

---

## 2. Αρχειοθετήθηκαν (`4-load-testing/archive/`)
- **Εφάπαξ scripts και logs των πειραμάτων** (ουρές `v5`–`v8`, `mem_queue*`, `night_run.sh`, `overnight_controller`,
  `agent_experiment*`, `patches/` κ.λπ.): δείχνουν πώς ξεκίνησε κάθε μετρημένο run. Δεν τρέχουν από εκεί
  (κάνουν `cd` στη ρίζα με σχετική διαδρομή).
- **`eval_hpa_20261003_1420_ABORTED/`**: το HPA run που χάλασε από αλλαγή script εν ώρα λειτουργίας (δεν βαθμολογήθηκε).
- **`timelines_until_2026-10-04/`** (2026-10-21): αντίγραφα των τεσσάρων `comparison*_timelines.png` και του
  `comparison.md` όπως ήταν στις 4/10, με όλα τα runs ως τότε. Το Prometheus κρατά δεδομένα 10 ημέρες, άρα αυτά τα
  γραφήματα δεν ξαναφτιάχνονται πια. Τα νέα γραφήματα του `compare_results.py` δείχνουν μόνο runs με `series.json`
  (`design_decisions.md` Α22).
- **`memory_snapshots/`** (από το `3-ai-agent/`):
  - `chroma_backup_2026-10-01_1100.json`: οι 9 εγγραφές που έσβησε η αφαίρεση του άκυρου HPA run (άλλη μορφή αρχείου)·
  - `chroma_snapshot_2026-10-01_2300_before_memory_test.json` (44 εγγραφές, 40 με μετρικές) και
    `…_2026-10-02_0000_after_memory_test.json` (46, 42 με μετρικές): η μνήμη του πειράματος μνήμης.
  - Επαναφορά: `python 3-ai-agent/memory_snapshot.py restore <αρχείο>`. Με τον τωρινό κώδικα οι 4 εγγραφές χωρίς μετρικές
    θα αγνοούνταν.

## 3. Σβήστηκαν
**Από το git (επανέρχονται με `git checkout a1fd3d5 -- <αρχείο>`):**
- `kind-config.yaml` στη ρίζα: αχρησιμοποίητο, το `deploy.sh` χρησιμοποιεί το `1-infrastructure/kind-config.yaml`
- `stress_profiler.py`: ο πρώτος profiler, τον αντικατέστησε το `capacity_discovery.py`
- `4-load-testing/zombie_background.js`, `zombie_test.js`: το σενάριο zombie δεν ξυπνούσε ποτέ τον agent (0.2 rps, κάτω
  από την πύλη των 0.8)
- `4-load-testing/v6_queue2.out`, `v6_queue3.out`: κενά
- `5-ml-training/dry_run_readings.csv`: πανομοιότυπο με το `4-load-testing/detector_validation_readings_run2.csv`
- `3-ai-agent/tests/test_v7.py`, `test_v8.py`: το περιεχόμενό τους (εκτός από τα tests των παλιών prompts) είναι στο
  `test_final_agent.py`

**Εκτός git (δεν επανέρχονται):** caches (`__pycache__`, `.pytest_cache`, `.jest-cache`, `coverage`), το build του
frontend, τα `.DS_Store`, το αδέσποτο `2-target-app/software-frontend/agent_memory/` (παλιά βάση ChromaDB) και το
`isolation_forest_baseline.pkl` της ρίζας (πρωτότυπο του Αυγούστου).

---

## 4. Τι έμεινε σκόπιμα
- **Τα αποτελέσματα όλων των εκδόσεων** (`eval_*`, `evaluation_results*.csv`, `comparison*`, `incident_log.csv`): η
  σύγκριση των εκδόσεων είναι αποτέλεσμα της διπλωματικής (π.χ. τυφλό cpuhog του v4: 0/2· τυφλό badconfig του v6:
  2/2). Labels στα CSV: `llm` = v4, `llm-v3`, `llm-v5` … `llm-v8`, `llm-agent-v1/v2` (παλιότερες ροές), `*-INVALID`
  (εξαιρούνται). Το `compare_results.py` και το `analyze_agent_steps.py` διαβάζουν και τα logs των παλιών εκδόσεων.
- **`rules` και `rules-v2`** (`RULES_RESTART=on`): είναι baselines της τελικής σύγκρισης, όχι παλιές εκδόσεις.
- **Οι σημειώσεις** (`NOTES_*`, `READ_ME_FIRST_*`, `design_decisions.md`): ημερολόγιο γραμμένο τη στιγμή που συνέβη.
  Όπου αναφέρουν `AIOPS_PROMPT=…`, `V6_PROMPT`, `test_v7.py` κ.λπ., αυτά βρίσκονται στο commit `a1fd3d5`.
- **`5-ml-training/isolation_forest_baseline.pkl`**: απόδειξη για την απόφαση Α2 (το χρησιμοποιεί το
  `thesis_notes/figures/detector_evidence.py`).
- **Στην εφαρμογή-στόχο (`2-target-app`)**: το endpoint `/chaos/zombie` (σενάριο που εγκαταλείφθηκε) και τα
  `software-backend/k6/`, `test-structured-logging.js` (από το μάθημα). **Δεν τα άγγιξα:** αλλαγή στην εφαρμογή θέλει
  νέο image, και όλα τα μετρημένα runs έτρεξαν με το τωρινό.

---

## 5. Οι εκδόσεις του agent σε έναν πίνακα (για το κείμενο)
| Έκδοση | Τι πρόσθεσε | Τι πήγε στραβά και οδήγησε στην επόμενη | Απόφαση |
|---|---|---|---|
| v3 | 3 βαθμίδες (SLO → χωρητικότητα → σπατάλη)· scale-up υποχρεωτικό για κάθε παραβίαση καθυστέρησης | στο stuck έκανε scale-up σε 1 από 3 runs | Α11 |
| v4 | «βρες πρώτα το bottleneck» (ψηλή καθυστέρηση με χαμηλή CPU → logs → restart)· tools: logs, scale, restart | τυφλό cpuhog: 0/2 (το είδε ως υπερφόρτωση και μετά ως σπατάλη) | Α11 |
| v5 | υπολογισμένη υπόδειξη «CPU ανά αίτημα = N× το υγιές» | στο τυφλό badconfig η υπόδειξη γενίκευσε λάθος: 3 άχρηστα restarts | Α11, Α14 |
| v6 | 7 tools (ανά-pod εικόνα, ιστορικό αλλαγών, logs· scale, restart, restart pod, rollback), «ψάξε την αιτία» | τυφλό badconfig 2/2 ✅· αλλά στο demo δεν έκανε scale-down, έκανε restart pod για ανισορροπία, δήλωσε ενέργεια που δεν έκανε, αποφάσισε πριν δει τα στοιχεία | Α14, Α15 |
| v7 | «ταξινόμησε πρώτα» με υπολογισμένα γεγονότα + 2 φραγμοί σε κώδικα | 2 restart χωρίς πλήρη διάγνωση (badconfig run 2· ένα παροδικό άλμα στο demo) | Α18 |
| **v8** | + φραγμός «πλήρης διάγνωση πριν από restart/rollback» και «restart μόνο με στοιχεία» | **6/6 σενάρια σωστά στην πρώτη αφύπνιση** | Α19 |

---

## 6. Τα k6 scripts οργανώθηκαν: ένα αρχείο ανά σενάριο (2026-10-11)
Πριν: τα τρία faults (stuck, cpuhog, badconfig) έτρεχαν **το ίδιο** `fault_load.js`, γιατί το φορτίο τους είναι ίδιο
(8 χρήστες, 16') και το fault το βάζει το harness, όχι το k6. Αυτό μπέρδευε («ποιο αρχείο είναι το stuck;»). Τώρα όλα
είναι στο `4-load-testing/k6/` με το όνομα του σεναρίου, και το `run_experiment.sh` τρέχει `k6/<SCENARIO>.js`.

| Πριν | Τώρα | Τι είναι |
|---|---|---|
| `4-load-testing/baseline_eval.js` | `k6/baseline.js` | το μετρημένο demo, 38' (παγωμένο) |
| `4-load-testing/fault_load.js` | `k6/stuck.js`, `k6/cpuhog.js`, `k6/badconfig.js` | ένα αρχείο ανά fault, **ίδιο φορτίο** |
| `4-load-testing/baseline.js` | `k6/demo.js` | το κομμένο 22' για χειροκίνητα demo (όχι συγκρίσιμο) |
| `4-load-testing/detector_validation.js` | `k6/detector_validation.js` | επικύρωση ανιχνευτή χωρίς agent |

**Το φορτίο δεν άλλαξε (ελέγχθηκε):** για κάθε νέο αρχείο, το `k6 inspect` (οι ρυθμίσεις όπως τις διαβάζει το k6) είναι
ίδιο με του παλιού, και χωρίς τα σχόλια τα αρχεία είναι ίδια γραμμή προς γραμμή. Άλλαξαν μόνο οι κεφαλίδες: κάθε αρχείο
λέει τώρα τι σπάει, πότε, τα συμπτώματα, τη σωστή ενέργεια, πώς βαθμολογείται και πώς τρέχει με το χέρι. Διορθώθηκε και ένα
λάθος σχόλιο του 22λεπτου (έλεγε «~40 minutes»). Άρα όλα τα μετρημένα runs μένουν συγκρίσιμα με όσα τρέξουν από εδώ και πέρα.
Τα prefixes των φακέλων (`eval_stuck_…`) και τα CSV αποτελεσμάτων είναι τα ίδια.

Ενημερώθηκαν: `run_experiment.sh`, `detector_validation.sh`, `inject.sh` (σχόλιο), `compare_results.py` (κείμενα του
`comparison.md`, αλλάζουν στην επόμενη παραγωγή του), `CLAUDE.md`, `study_guide.md`, `manual_testing.md`,
`design_decisions.md`. **Δεν** άλλαξαν: τα scripts στο `archive/` και οι σημειώσεις με ημερομηνία (`NOTES_*`,
`READ_ME_FIRST_*`, `OVERNIGHT_REPORT_*`): γράφουν τα παλιά ονόματα, όπως ήταν τότε. Τα παλιά αρχεία:
`git show a1fd3d5:4-load-testing/fault_load.js` (κ.λπ.).

## 7. Φάση 2: ό,τι έφυγε από τον κώδικα με τον σχεδιασμό NFR (2026-10-22)

Αφορμή και αποφάσεις: `design_decisions.md` Α24. Όλη η φάση 1 μπήκε σε commit πριν από την πρώτη αλλαγή: branch
`nfr-v9`, commit `1794a69`, **tag `v8.1-campaign`**. Κάθε αρχείο που αναφέρεται εδώ ξαναβγαίνει με
`git show v8.1-campaign:<path>`.

| Τι | Πού ήταν | Γιατί έφυγε / πού είναι τώρα |
|---|---|---|
| Ένα OCSVM ανά αριθμό pods, χαρακτηριστικά CPU / throttling / p95 / throughput (backend) | `5-ml-training/*.py`, `health_model.pkl` | Οι καθηγητές ζήτησαν ένα μοντέλο με είσοδο τον αριθμό pods, και ανίχνευση με βάση τις NFR, όχι τη CPU. Τα scripts, τα δεδομένα και τα μοντέλα της φάσης 1 είναι στο `5-ml-training/phase1/` (αντίγραφα που τρέχουν, ώστε τα σχήματα της φάσης 1 να ξαναβγαίνουν). |
| Επαλήθευση με κατώφλια (CPU < 0.75, throttling < 10%, p95 < 0.35 σε ένα παράθυρο 40 s) | `agent_tools._check_stabilization` | Ο χρήστης όρισε επαλήθευση με την πορεία του score του SVM (Α24). |
| Εργαλεία `restart_kubernetes_pod`, `rollback_kubernetes_deployment` | `agent_tools.py` | Απόφαση του χρήστη: ο agent κρατά scale και restart όλης της εφαρμογής. |
| Σενάριο badconfig (`FEATURE_LOGIN_AUDIT`, `k6/badconfig.js`) | backend `services/authService.js`, harness | Χωρίς rollback ο agent δεν μπορεί να το λύσει, άρα δεν μετριέται. |
| Baselines rules / rules-v2 / static-1 / static-3 (`3-ai-agent/rule_scaler.py`) | `3-ai-agent/`, `run_experiment.sh` | Οι καθηγητές ζήτησαν σύγκριση μόνο με τον native μηχανισμό (HPA). |
| Φορτίο κλειστού μοντέλου μόνο σε login (`k6/*.js` με VUs) | `4-load-testing/k6/` | Αντικαταστάθηκε από μίξη endpoints σε ανοιχτό μοντέλο (`k6/lib/mix.js`, `make_profiles.py`). |
| `incident_log.csv` της φάσης 1 | `3-ai-agent/` | Μετονομάστηκε `incident_log_phase1.csv` (η φάση 2 έχει άλλες στήλες). |
| Επικύρωση ανιχνευτή της φάσης 1 (run 2, φάσεις, logs, scripts) | `4-load-testing/detector_validation_*` | `4-load-testing/archive/detector_validation_phase1/` (το σχήμα `make_validation_timeline.py` διαβάζει από εκεί). |
| `campaign_rerun.sh` και τα `*.nohup` της καμπάνιας 21/10 | `4-load-testing/` | `4-load-testing/archive/`. |

**Δεν άλλαξαν:** τα αποτελέσματα της φάσης 1 (`evaluation_results*.csv`, `comparison.md`, `eval_*` φάκελοι, η αναφορά
`campaign-2026-10-21.md`), τα σχήματα της φάσης 1 και οι σημειώσεις με ημερομηνία. Η φάση 2 γράφει σε νέα αρχεία
(`results_nfr*.csv`, `comparison_nfr.md`), γιατί οι μετρικές της (στο ingress, με τη μίξη) δεν συγκρίνονται ένα προς ένα με
της φάσης 1.

## 8. Agent v10: ό,τι έφυγε με το νέο μοντέλο (2026-10-26, Α28 / Α28.1)

Ο κώδικας του v9 βρίσκεται στο git tag `v9-campaign`. Τα αρχεία του μοντέλου του είναι στο `5-ml-training/v9/`: το bundle
(gitignored), το report, τα φιλτραρισμένα δεδομένα και οι μετρήσεις της επικύρωσης A–I.

| Τι | Πού ήταν | Γιατί έφυγε |
|---|---|---|
| Το SVM του v9: είσοδοι log(throughput), 4·log(max(p95, 0.2)), 100·σφάλματα, 12·pods, και υγιή = p95 < 0.35 s | `health_model.transform`, `train_health_baseline.py` | Το όριο latency έβγαινε διαφορετικό ανά αριθμό pods, και η σειρά αναποδογύριζε (95 rps / 0.15 s ανωμαλία, 103 rps / 0.30 s υγιές). Το score ήταν +0.01..0.06 στο υγιές και κολλούσε στο −0.537. |
| Η επαλήθευση στον κινητό μέσο 30 s, με το `trend_eps` | `health_model.judge_trajectory`, `agent_tools._check_stabilization` | Ο κανόνας του χρήστη, μέτρηση προς μέτρηση, πάνω στο score που διαβάζεται ως απόσταση και δεν κορεστώνεται. |
| Ο κανόνας «ελάχιστα pods με 15% περιθώριο πάνω στον πίνακα χωρητικότητας» (`HEADROOM`) και η σχέση ABOVE / CLOSE (≥ 85%) / well within | `agent._minimum_pods`, `agent._computed_facts` | Ο ελάχιστος αριθμός pods βγαίνει πλέον από το ίδιο το μοντέλο (`health_model.min_healthy_pods`), και η θέση του φορτίου από τη ζώνη του μοντέλου. |
| Το σταθερό «όμοιο» της μνήμης, `MEMORY_SIMILAR_MAX = 1.5` | `agent_tools.py` | Βγαίνει από το μοντέλο: `bundle["memory_similar_max"]`. |
| Οι NFR γραμμένες χωριστά σε ~6 αρχεία (0.35 / 0.25 / 1% / 3 pods) | `capacity_discovery.py`, `train_health_baseline.py`, `evaluate_run.py`, `compare_results.py`, `agent.py`, `agent_tools.py` | Ένα σημείο: `nfr_metrics.py` (`NFR_P95`, `NFR_ERRORS`, `MAX_PODS`, `SAFE_P95`, `SAFE_ERRORS`). |
| Η ετικέτα `llm-v9` καρφωμένη στις αναφορές | `compare_results.py`, `campaign_report.py`, `run_experiment.sh` | `AGENT_LABEL` (default `llm-v10`). Για την καμπάνια του v9: `AGENT_LABEL=llm-v9`. |
| **Δοκιμάστηκε και δεν μπήκε:** αντίγραφα κάθε υγιούς μέτρησης με χαμηλότερο p95 (η μέθοδος όπως δηλώθηκε στην Α28) | το commit `8334774` | Απέτυχε τη μονοτονία και το held-out. Λεπτομέρειες στην Α28.1 και στο `phase2_worklog.md`. |
| Τα αρχεία σύγκρισης της καμπάνιας του v9 (`comparison_nfr.md` και τα 3 γραφήματα timelines), που η καμπάνια του v10 ξαναγράφει στα ίδια ονόματα | `4-load-testing/` | Αντίγραφα από το git (ίδια με το tag `v9-campaign`) στο `4-load-testing/archive/comparison_campaign-2026-10-23_v9/` (2026-10-27). |
| Η σύνοψη αποτελεσμάτων του v9 | `thesis_notes/results_summary.md` | Μετονομάστηκε σε `results_summary_v9.md`· το `results_summary.md` είναι πλέον του v10 (2026-10-27). |

## 9. Agent v11: ό,τι έφυγε με τις μονάδες NFR (2026-10-27, Α30)

Ο κώδικας του v10 βρίσκεται στο git tag `v10-campaign`. Τα αρχεία του μοντέλου του είναι στο `5-ml-training/v10/`: το bundle
(gitignored, ξαναφτιαγμένο από το tag), το report, τα φιλτραρισμένα δεδομένα και οι μετρήσεις της ζωντανής επικύρωσης
(26/10). Οι φάσεις και τα logs της επικύρωσης είναι στο `4-load-testing/archive/detector_validation_v10/`.

| Τι έφυγε | Από πού | Τι μπήκε / γιατί |
|---|---|---|
| Τα 4 βάρη των εισόδων στο grid (φορτίο {1, 2, 4}, latency {1, 2, 4}, σφάλματα {1, 3}, pods {8, 12}): 144 συνδυασμοί | `train_health_baseline.py`, `health_model.transform` | Μονάδες από τις NFR (0 = ασφαλές, 1 = NFR), και μόνο το γ στο grid. Τα βάρη των pods και η τυποποίηση δεν άλλαζαν τίποτα· το βάρος του latency όριζε μόνο μια μονάδα. |
| Η τυποποίηση του φορτίου με τον μέσο και την τυπική απόκλιση των δεδομένων | `health_model.transform` | ln(rps): η μονάδα δεν εξαρτάται από το πλάτος των ραμπών της συλλογής. |
| Σφάλματα / 1% χωρίς πάτωμα | `health_model.transform` | Πάτωμα στο ασφαλές 0.1%, όπως το latency στα 0.25 s. |
| Βάρος pods 8 | `health_model.transform` | `POD_SEPARATION` = 100: χωριστές περιοχές εξ ορισμού. |
| `healthy_ranges` (min / max ανά αριθμό pods από τα δεδομένα: φορτίο ανά pod, μέγιστο p95, μέγιστα σφάλματα) | bundle, `health_model.explain`, `min_healthy_pods` | Η εξήγηση συγκρίνει με τις ζώνες του μοντέλου (`bands`) και με το ασφαλές επίπεδο: ένα όριο latency σε όλο το σύστημα. |
| Η ετικέτα `llm-v10` ως default | `run_experiment.sh`, `compare_results.py`, `campaign_report.py` | `llm-v11`. Για την καμπάνια του v10: `AGENT_LABEL=llm-v10`. |
| Οι μετρήσεις και τα logs της ζωντανής επικύρωσης του v10 στον βασικό φάκελο | `5-ml-training/dry_run_readings.csv`, `4-load-testing/detector_validation*` | Μεταφέρθηκαν (`git mv`) στο `5-ml-training/v10/` και στο `4-load-testing/archive/detector_validation_v10/`. Το `replay_model.py` τα ξαναπαίζει. |

## 10. Οργάνωση των σημειώσεων (2026-10-31)

Ο χρήστης ζήτησε (31/10) ένα σημείο εκκίνησης, και τα αρχεία με σειρά από το πιο πρόσφατο. Νέο `thesis_notes/README.md`
(σειρά ανάγνωσης, εκδόσεις, πού είναι τα αποτελέσματα). Οι αλλαγές:

| Τι μετακινήθηκε | Από | Πού (`git mv`) |
|---|---|---|
| Η σύνοψη του v10 | `thesis_notes/results_summary.md` | `thesis_notes/history/v10/results_summary_v10.md` (το `results_summary.md` είναι πλέον του v11) |
| Η σύνοψη του v9 | `thesis_notes/results_summary_v9.md` | `thesis_notes/history/v9/results_summary_v9.md` |
| Σύνοψη, οδηγός μελέτης, ερωτήσεις της φάσης 1 | `thesis_notes/*_phase1.md` | `thesis_notes/history/phase1/` |
| Η ερευνητική πλαισίωση της φάσης 1 | `THESIS_SUMMARY_EN.md` (ρίζα) | `thesis_notes/history/phase1/THESIS_SUMMARY_EN.md` |
| Οι πρώτες σημειώσεις (1–4/10) | `READ_ME_FIRST_2026-10-01.md`, `READ_ME_FIRST_2026-10-04.md`, `NOTES_2026-10-01_DAY.md`, `NOTES_2026-10-03.md` (ρίζα) | `thesis_notes/history/phase1/early_notes/` |

- Στην κορυφή του `design_decisions.md` και του `phase2_worklog.md` μπήκε ευρετήριο από το πιο πρόσφατο.
- Οι παραπομπές στα ζωντανά αρχεία ενημερώθηκαν: `README.md`, `CLAUDE.md`, `system_overview.md`, `study_guide.md`,
  `defense_qa.md`, `4-load-testing/archive/README.md`.
- Οι παλιές παραπομπές μέσα στα ημερολόγια και στο ιστορικό μένουν όπως γράφτηκαν.


## 11. Agent v12: ό,τι έφυγε με τα probes-εύρη (2026-11-01, Α31)

Ο κώδικας του v11 βρίσκεται στο git tag `v11-campaign`. Τα αρχεία του μοντέλου του είναι στο `5-ml-training/v11/`: το bundle
(gitignored· το replay του v12 το χρησιμοποιεί ως μοντέλο αναφοράς), το report, τα φιλτραρισμένα δεδομένα και οι μετρήσεις της
ζωντανής επικύρωσης (27/10). Οι φάσεις και τα logs της επικύρωσης είναι στο `4-load-testing/archive/detector_validation_v11/`.

| Τι έφυγε | Από πού | Τι μπήκε / γιατί |
|---|---|---|
| Τα 40 probes-σημεία της Α28 (`build_probes` με HEALTHY mid / top, FAST low / mid / top, NFR σε 3 θέσεις, ABOVE, WASTE, AFTER scale-down, STUCK, OUTAGE) | `train_health_baseline.py` | Probes-εύρη (Α31): κάθε σημείο έγινε το εύρος του, συν «καμία τρύπα, κανένα νησί», μετά από scale-up, αδράνεια, τα σφάλματα όπως μετρήθηκαν, μονοτονία και στα σφάλματα. Τα σημεία έχασαν την τρύπα του 1 pod στα 18 rps. |
| Η κρίση όλης της πορείας από τα 60 s | `agent_tools.py`, `replay_model.py`, `judge_trajectory` | `VERIFY_JUDGE_FROM_SECONDS = 10` (όρισμα `judge_from`) για το «worse»· το «not improving» μένει από τα 60 s (`VERIFY_WINDOW_FULL_SECONDS`, Α31.1). |
| `min_healthy_pods` → ο μεγαλύτερος αριθμός όταν κανένας δεν είναι υγιής | `health_model.py`, `agent._computed_facts` | Ο μικρότερος αν το φορτίο είναι κάτω από κάθε ζώνη, ο μεγαλύτερος μόνο αν είναι πάνω. Τα γεγονότα το λένε. |
| Η ετικέτα `llm-v11` ως default | `run_experiment.sh`, `compare_results.py`, `campaign_report.py` | `llm-v12`. Για την καμπάνια του v11: `AGENT_LABEL=llm-v11`. |
| Οι μετρήσεις και τα logs της ζωντανής επικύρωσης του v11 στον βασικό φάκελο | `5-ml-training/dry_run_readings.csv`, `4-load-testing/detector_validation*` | Μεταφέρθηκαν (`git mv`) στο `5-ml-training/v11/` και στο `4-load-testing/archive/detector_validation_v11/`. Το `replay_model.py` τα ξαναπαίζει. |

**Προστέθηκαν, όχι αφαιρέθηκαν:** η σκάλα σταθερού φορτίου του 1 pod στο `collect_healthy_data.py` (`--low-end-only`, στήλη
`segment`), η χρονοσειρά της δοκιμής του χρήστη της 1/11 (`4-load-testing/archive/manual_demo_2026-11-01/series.json`, από το
Prometheus) και το `4-load-testing/archive/v12_live_queue.sh`.
