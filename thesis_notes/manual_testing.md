# Οδηγός χειροκίνητων δοκιμών (φάση 2: NFR, agent v9, σύγκριση με HPA)

Πώς τρέχεις και ελέγχεις μόνος σου κάθε σενάριο, βήμα-βήμα. Όλες οι εντολές τρέχουν από τη ρίζα του repo
(`~/Documents/LLM_AGENT`), σε macOS / zsh. Χρειάζεσαι **3 τερματικά**:
1. ο agent·
2. το φορτίο (k6)·
3. εντολές και παρατήρηση.

Ο οδηγός της φάσης 1 (agent v8.1, rules, badconfig) βγαίνει με `git show v8.1-campaign:thesis_notes/manual_testing.md`.

> **Σημαντικό:** όσο τρέχουν αυτόματα πειράματα (`pgrep -fl "full_campaign|run_experiment|capacity_discovery|collect_healthy"`),
> **μην** κάνεις χειροκίνητες δοκιμές. Δύο controllers στο ίδιο deployment «μάχονται» και χαλάνε και τα δύο.

---

## 0. Τι άλλαξε στη φάση 2 (σε μία ματιά)

- **Τι μετράμε:** latency, σφάλματα και throughput στο **ingress**, όπως τα βλέπει ο χρήστης. Οι NFR είναι p95 < 0.35 s και
  σφάλματα < 1%.
- **Φορτίο:** μίξη endpoints, όχι μόνο login (30% search, 25% λεπτομέρειες τόπου, 15% reviews, 10% recommendations, 10% login,
  10% εγγραφές). Είναι ανοιχτό μοντέλο: ο k6 στέλνει **αιτήματα ανά δευτερόλεπτο**, όχι χρήστες που περιμένουν.
- **Χωρητικότητα (μετρημένη):** 1 pod 95 rps · 2 pods 165 · 3 pods 255. Τα 4 pods δίνουν 315, αλλά το ταβάνι είναι 3.
- **Ανιχνευτής:** **ένα** One-Class SVM με είσοδο τον αριθμό pods.
- **Agent v9:** έχει 5 εργαλεία (3 παρατήρησης + scale + restart όλης της εφαρμογής). Μετά από κάθε ενέργεια ακολουθεί το
  **score** του SVM:
  - βελτιώνεται → περιμένει·
  - χειροτερεύει ή κολλάει → ο agent ξαναξυπνά αμέσως.
- **Σύγκριση:** μόνο με το **HPA** (CPU 60%). Και οι δύο μέθοδοι έχουν τα ίδια readiness και liveness probes.

---

## 1. Προετοιμασία (μία φορά)

```bash
docker info >/dev/null && kind get clusters                  # aiops-cluster
kubectl get pods -A | grep -v Running                        # μόνο η κεφαλίδα = όλα Running
grep aiops /etc/hosts                                        # mwtback / prometheus / grafana / chromadb .aiops -> 127.0.0.1
curl -s -o /dev/null -w "%{http_code}\n" http://prometheus.aiops/-/ready          # 200
curl -s http://mwtback.aiops/ready                           # {"status":"ready"}
curl -s "http://mwtback.aiops/places/search?keywords=Athens" | head -c 200        # ο κατάλογος (SEED_DATASET=load)

source .venv/bin/activate
export GEMINI_API_KEY=...        # το κλειδί σου (το .env ΔΕΝ φορτώνεται αυτόματα)
.venv/bin/python3 -m pytest 3-ai-agent/tests -q              # 79 passed
(cd 2-target-app/software-backend && npm test)               # 812 passed
python 4-load-testing/llm_ready.py                           # απαντά το Gemini; (το κλειδί δεν τυπώνεται)
```

**Έχει μετρήσεις το ingress;** Στο `http://prometheus.aiops/graph`:
`sum(rate(nginx_ingress_controller_requests{host="mwtback.aiops"}[1m]))`. Αν είναι κενό, ο controller χρειάζεται τα
`--enable-metrics=true --time-buckets=...` (`deploy.sh`) και το `1-infrastructure/ingress-metrics.yaml`.

### Επαναφορά σε καθαρή κατάσταση (πριν από κάθε σενάριο)
```bash
./4-load-testing/inject.sh reset        # rolling restart, 1 pod, περιμένει το rollout
./4-load-testing/inject.sh status       # pods: έτοιμα / ζητούμενα
```
Περίμενε ~2 λεπτά πριν ξεκινήσεις: ο ανιχνευτής αγνοεί τις μετρήσεις για 90 s μετά από αλλαγή pods.

---

## 2. Ξεκίνα τον agent (τερματικό 1)

```bash
python 3-ai-agent/anomaly_detector.py              # ο agent v9
python 3-ai-agent/anomaly_detector.py --dry-run    # μόνο ο ανιχνευτής: χωρίς LLM, δεν αγγίζει το cluster
```
Κάθε 10 s τυπώνει μια γραμμή:
`rps: 57.0 (57.0/pod), p95: 0.120s, errors: 0.0%, replicas: 1 (ready 1), prediction: 1 (score +0.0250)`.

**Το score:** ≥ 0 = υγιές, < 0 = ανωμαλία. Κοντά στο 0 θορυβεί, κατά ±0.026 ανάμεσα σε δύο μετρήσεις.

**Η ροή μιας ανωμαλίας:**
1. Τρεις ανώμαλες μετρήσεις στη σειρά δίνουν `ANOMALY DETECTED!` με την εξήγηση, π.χ. «p95 latency 4.64 s is above the
   healthy maximum 0.35 s».
2. Ξυπνά ο agent, και βλέπεις όλα τα βήματά του.
3. Μετά τρέχει η επαλήθευση:
   ```
   ⏳ Rollout converged after 0s; following the health score every 10s (before the action: -0.537)...
      + 50s score -0.537 (... errors 14.1%) -> WAIT
      + 60s score +0.025 (... errors 0.0%) -> WAIT
      + 80s score +0.025 (... errors 0.0%) -> STABLE
   ```
   - Η πορεία κρίνεται στον μέσο όρο των τελευταίων 30 s.
   - Το πρώτο λεπτό μετά την ενέργεια δεν βγαίνει ποτέ UNSTABLE, γιατί το παράθυρο έχει ακόμα παλιά δεδομένα.
   - Αν βγει `UNSTABLE: not improving` ή `UNSTABLE: worse ...`, ο ανιχνευτής ξαναξυπνά τον agent αμέσως. Αυτό γίνεται το
     πολύ 2 φορές στη σειρά.

Επιλογές:
- `AIOPS_MEMORY=off`: χωρίς μνήμη.
- `AIOPS_ACT_GUARD=off`: χωρίς τους τρεις φραγμούς.
- `AIOPS_FALLBACK_MODEL=off`: χωρίς εφεδρικό μοντέλο. Το default είναι `gemini/gemini-2.5-flash`, που μπαίνει μετά από 4
  αποτυχίες του κύριου.

**Τι να παρακολουθείς (τερματικό 3):**
```bash
kubectl get pods -l app=aiops-backend -w                 # pods: READY 0/1 = το readiness τα έβγαλε εκτός
tail -f 3-ai-agent/incident_log.csv                      # κάθε αφύπνιση: score, εξήγηση, ενέργειες, ετυμηγορία, ανάκαμψη
```
Prometheus, το p95 όπως το βλέπει ο χρήστης:
`histogram_quantile(0.95, sum(rate(nginx_ingress_controller_request_duration_seconds_bucket{host="mwtback.aiops"}[1m])) by (le))`

---

## 3. Σενάριο: κανονικό φορτίο (κλιμάκωση πάνω και κάτω)

```bash
k6 run 4-load-testing/k6/baseline.js      # 38 λεπτά, το μετρημένο σενάριο
k6 run 4-load-testing/k6/demo.js          # 22 λεπτά, η γρήγορη εκδοχή
```
| Λεπτό (baseline.js) | Φορτίο | Αναμενόμενο |
|---|---|---|
| 0–5 | 42.8 rps | 1 pod, καμία ενέργεια |
| 5–13 | → 123.5 rps | πάνω από τα 95 του 1 pod: αφύπνιση, «CAPACITY», `scale 1->2`, STABLE |
| 13–21 | → 210 rps | πάνω από τα 165 των 2 pods: `scale 2->3` |
| 21–29 | → 105.2 rps | τα 3 pods είναι σπατάλη (κάτω από 115.5): `scale 3->2` |
| 29–38 | → 42.8 rps | τα 2 pods είναι σπατάλη (κάτω από 66.5): `scale 2->1` |

Τα γεγονότα που βλέπει ο agent λένε «ABOVE that capacity» ή «Minimum pod count ... : N». Στο κανονικό φορτίο συνήθως δεν
χρειάζεται εργαλεία παρατήρησης.

---

## 4. Σενάριο: κολλημένη εξάρτηση (stuck)

```bash
k6 run 4-load-testing/k6/stuck.js         # τερματικό 2: 57 rps για 16 λεπτά (1 pod)
./4-load-testing/inject.sh stuck          # τερματικό 3, μετά από ~4 λεπτά
```
**Τι γίνεται:**
- Κάθε αίτημα του pod περιμένει 3 s και παίρνει 503.
- Το `/ready` αποτυγχάνει, και μέσα σε ~15 s το readiness βγάζει το pod εκτός. Με 1 pod, **όλα** τα αιτήματα γίνονται 503
  στο ingress.
- Ο ανιχνευτής βλέπει «errors 63%», ο agent ξυπνά.

**Τι πρέπει να κάνει ο agent:**
- Τα γεγονότα λένε «load WITHIN capacity» και «0 of 1 pods ready», άρα τρέχει Step 2B.
- Περνάει από τα 3 εργαλεία παρατήρησης· τα logs δείχνουν `[ERROR] DB connection pool exhausted`.
- Κάνει `restart_kubernetes_deployment()`, και η επαλήθευση βγάζει STABLE σε ~80 s.

Στο δοκιμαστικό run της 23/10 η ανάκαμψη ήταν 130 s. Το HPA δεν ανέκαμψε ποτέ: χωρίς κίνηση η CPU πέφτει στο 1%.

---

## 5. Σενάριο: runaway background job (cpuhog)

```bash
k6 run 4-load-testing/k6/cpuhog.js        # τερματικό 2
./4-load-testing/inject.sh cpuhog         # τερματικό 3, μετά από ~4 λεπτά
```
**Τι γίνεται:**
- Μια εργασία που δεν τελειώνει ποτέ μπλοκάρει το event loop.
- Μοιάζει με υπερφόρτωση, αλλά το φορτίο είναι μόλις 57 rps.

**Τι πρέπει να κάνει ο agent:**
- Τα γεγονότα λένε «WITHIN capacity».
- Το `get_pod_breakdown` δείχνει CPU ανά αίτημα πολλαπλάσια του υγιούς 0.0084 και μεγάλο event-loop lag.
- Τα logs δείχνουν `job "rebuild-search-index" still running`.
- Σωστή ενέργεια: restart.

Στο δοκιμαστικό run το HPA πήγε 1→2 και έμεινε εκεί με p95 ~0.6 s, χωρίς ανάκαμψη.

---

## 6. Ένα μετρημένο run με το χέρι

```bash
SCENARIO=stuck ./4-load-testing/run_experiment.sh llm      # ή hpa· SCENARIO=baseline|stuck|cpuhog
```
**Τι κάνει:**
1. Καθαρή επαναφορά (restart, 1 pod, καθαρό ιστορικό, 120 s αναμονή).
2. Ξεκινά τη στρατηγική.
3. Τρέχει το k6 του σεναρίου· στα faults βάζει το fault στο 4ο λεπτό.
4. Σταματά και βαθμολογεί.

**Πού γράφονται τα αποτελέσματα:**
- Φάκελος `4-load-testing/eval_[σενάριο_]στρατηγική_ώρα/`, με `score.txt`, `controller.log`, `k6.log`, `k6_summary.json`,
  `series.json`, `events.txt`.
- Μία γραμμή στο `results_nfr*.csv`.

---

## 7. Ολόκληρη η σύγκριση με μία εντολή (η καμπάνια)

```bash
./4-load-testing/full_campaign.sh campaign-2026-10-23            # agent και HPA: 4 × κανονικό, 4 × stuck, 4 × cpuhog
NORMAL_RUNS=1 FAULT_RUNS=1 ./4-load-testing/full_campaign.sh smoke-...   # δοκιμαστική (1 run από το καθένα)
```
**Πριν ξεκινήσεις:**
- laptop στην πρίζα, καπάκι ανοιχτό, μόνο Docker και ένα τερματικό·
- `llm_ready.py` απαντά·
- κανένα άλλο πείραμα δεν τρέχει.

**Τι κάνει:**
- Αδειάζει τη μνήμη `incidents_nfr`.
- Εναλλάσσει runs agent και HPA, και κάθε run περιμένει ρεύμα.
- Ένα run του agent ξεκινά μόνο όταν απαντά το κύριο μοντέλο.

**Παρακολούθηση:**
```bash
grep -v "^[0-9a-f]\{64\}" 4-load-testing/<TAG>.log | tail      # start / end κάθε run
ls -dt 4-load-testing/eval_* | head -1                          # το τρέχον run
```
**Σταμάτημα:** `pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh`

**Αποτελέσματα:**

| Αρχείο | Τι έχει |
|---|---|
| `4-load-testing/<TAG>.md` | ανά run του agent: σωστή ενέργεια στην 1η αφύπνιση, ανάκαμψη, φραγμοί, εφεδρικό μοντέλο· πίνακες agent / HPA |
| `4-load-testing/comparison_nfr.md` | μέσοι όροι, στατιστικά (permutation, Fisher) |
| `4-load-testing/comparison_nfr*_timelines.png` | γραφήματα: pods (συμπαγές = ζητούμενα, διακεκομμένο = έτοιμα), rps, κόκκινο = παραβίαση NFR |

---

## 8. Ξαναχτίσιμο του μοντέλου (μόνο αν αλλάξει η εφαρμογή, η μίξη ή τα pods)

Με τον ανιχνευτή **σβηστό** και χωρίς άλλη κίνηση:
```bash
.venv/bin/python3 5-ml-training/capacity_discovery.py       # ~75', -> capacity_table.json (1-4 pods)
.venv/bin/python3 4-load-testing/k6/make_profiles.py        # -> τα σενάρια k6 από τον πίνακα (μετά: commit)
.venv/bin/python3 5-ml-training/collect_healthy_data.py     # ~55', -> baseline_metrics_healthy.csv
.venv/bin/python3 5-ml-training/train_health_baseline.py    # δευτερόλεπτα: probes, held-out, επιλογή, ε
./4-load-testing/detector_validation.sh && .venv/bin/python3 4-load-testing/analyze_validation.py   # ~34'
```
Μετά από νέα χωρητικότητα, άλλαξε και τον στόχο του HPA (`baselines/hpa.yaml`, το σκεπτικό στο design_decisions Α25).

---

## 9. Αν κάτι πάει «στραβά»

- **Σποραδικά 502 σε POST:** σημαίνει ότι λείπει η διόρθωση keep-alive (`server.js`, Α25). Ξαναχτίσε το image.
- **`prediction` πολύ κοντά στο 0 σε κανονικό φορτίο:** είναι αναμενόμενο. Στο 1 pod τα υγιή score είναι ~+0.01. Ο
  ανιχνευτής θέλει 3 στη σειρά, και η επαλήθευση κρίνει στον μέσο όρο 30 s (Α26).
- **Ο agent ξανά και ξανά UNSTABLE:** δες στο `incident_log.csv` τη στήλη `verification_detail`, που έχει την πορεία του
  score, και αν τα pods είναι έτοιμα (`kubectl get pods`).
- **Gemini 503 / timeout:** η καμπάνια περιμένει μόνη της. Με το χέρι, ξαναδοκίμασε `llm_ready.py`.
- **Ο laptop κοιμήθηκε:** οι μετρήσεις της ώρας αυτής είναι άκυρες. Τα scripts τρέχουν με `caffeinate`, αλλά στην μπαταρία
  με κλειστό καπάκι ο Mac κοιμάται.
