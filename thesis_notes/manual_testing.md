# Οδηγός χειροκίνητων δοκιμών (φάση 2: NFR, agent v13, σύγκριση με HPA)

Πώς τρέχεις και ελέγχεις μόνος σου κάθε σενάριο. Όλες οι εντολές τρέχουν από τη ρίζα του repo (`~/Documents/LLM_AGENT`),
σε macOS / zsh. Υπάρχουν δύο τρόποι:
- **Α. Με μία εντολή (§6):** μετρημένο run, όπως στην καμπάνια. Ό,τι χρειάζεται το κάνει μόνο του.
- **Β. Με το χέρι, σε 3 τερματικά (§2–§5):** για να βλέπεις τι γίνεται ζωντανά. Είναι για επίδειξη, όχι για μετρήσεις.

Ο οδηγός της φάσης 1 (agent v8.1, rules, badconfig) βγαίνει με `git show v8.1-campaign:thesis_notes/manual_testing.md`.

> **Σημαντικό:**
> - Όσο τρέχουν αυτόματα πειράματα (`pgrep -fl "full_campaign|run_experiment|capacity_discovery|collect_healthy"`),
>   **μην** κάνεις χειροκίνητες δοκιμές. Δύο controllers στο ίδιο deployment «μάχονται» και χαλάνε και τα δύο.
> - Για μετρήσεις, το laptop πρέπει να είναι **στην πρίζα**. Ένα run σε μπαταρία είναι άκυρο.

---

## 0. Το σύστημα σε μία ματιά (v13)

- **Τι μετράμε:** latency, σφάλματα και throughput στο **ingress**, όπως τα βλέπει ο χρήστης. NFR: p95 < 0.35 s και
  σφάλματα < 1%. Ασφαλές επίπεδο: p95 ≤ 0.25 s.
- **Φορτίο:** μίξη endpoints (30% search, 25% λεπτομέρειες τόπου, 15% reviews, 10% recommendations, 10% login, 10% εγγραφές),
  σε **αιτήματα ανά δευτερόλεπτο** (ανοιχτό μοντέλο).
- **Χωρητικότητα:** 1 pod 95 rps, 2 pods 165, 3 pods 255 (ασφαλές). Το ταβάνι είναι 3 pods.
- **Ανιχνευτής:** **ένα** One-Class SVM. Οι υγιείς ζώνες φορτίου είναι 1 pod 1–87, 2 pods 73.5–162, 3 pods 123–251 rps.
  Latency και σφάλματα μετρούν πάνω από το ασφαλές επίπεδο. Κρίνει κάθε μέτρηση, και αμέσως μετά από αλλαγή pods (v13).
- **Agent v13** (ο v12 με αυτή την αλλαγή στον ανιχνευτή): 5 εργαλεία (3 παρατήρησης, scale, restart όλης της εφαρμογής). Μετά από κάθε ενέργεια ο κώδικας ακολουθεί
  το score του SVM: υγιές → STABLE· χειροτερεύει ή κολλάει → ο agent ξαναξυπνά.
- **Σύγκριση:** με το **HPA** (CPU 60%). Και οι δύο έχουν τα ίδια readiness και liveness probes.

---

## 1. Προετοιμασία (μία φορά)

```bash
docker info >/dev/null && kind get clusters                  # aiops-cluster
kubectl get pods -A | grep -v Running                        # μόνο η κεφαλίδα = όλα Running
grep aiops /etc/hosts                                        # mwtback / prometheus / grafana / chromadb .aiops -> 127.0.0.1
curl -s -o /dev/null -w "%{http_code}\n" http://prometheus.aiops/-/ready          # 200
curl -s http://mwtback.aiops/ready                           # {"status":"ready"}

source .venv/bin/activate
set -a; source .env; set +a      # φορτώνει το GEMINI_API_KEY στο τερματικό, χωρίς να το τυπώσει
.venv/bin/python3 -m pytest 3-ai-agent/tests -q              # 86 passed
python 4-load-testing/llm_ready.py                           # απαντά το Gemini; (το κλειδί δεν τυπώνεται)
```

**Έχει μετρήσεις το ingress;** Στο `http://prometheus.aiops/graph`:
`sum(rate(nginx_ingress_controller_requests{host="mwtback.aiops"}[1m]))`.

### Επαναφορά σε καθαρή κατάσταση (πριν από κάθε σενάριο με το χέρι)
```bash
./4-load-testing/inject.sh reset        # rolling restart, 1 pod, περιμένει το rollout
./4-load-testing/inject.sh status       # pods: έτοιμα / ζητούμενα
(cd 5-ml-training && ../.venv/bin/python3 -c "import k6_driver; k6_driver.make_token_pool()")   # χρήστες συνδεδεμένοι από πριν
```
Περίμενε ~2 λεπτά πριν ξεκινήσεις, ώστε τα παράθυρα του 1 λεπτού να ξεχάσουν το restart. (Αν ο ανιχνευτής τρέχει ήδη, δεν
παραλείπει τίποτα: ακολουθεί την αλλαγή pods με τον κανόνα της επαλήθευσης και γράφει στο log «Pods changed to N … following
the change (WAIT)» ή «The change to N pod(s) is healthy», Α32.)

Το token pool κάνει τα logins **πριν** από τη μέτρηση. Χωρίς αυτό, το k6 ξεκινά με 20 logins μαζί, και αυτό φαίνεται σαν
μικρό άλμα.

---

## 2. Ξεκίνα τον agent (τερματικό 1)

```bash
python 3-ai-agent/anomaly_detector.py              # ο agent v13
python 3-ai-agent/anomaly_detector.py --dry-run    # μόνο ο ανιχνευτής: χωρίς LLM, δεν αγγίζει το cluster
```
Κάθε 10 s τυπώνει μια γραμμή:
`rps: 57.0 (57.0/pod), p95: 0.113s, errors: 0.0%, replicas: 1 (ready 1), prediction: 1 (score +1.000)`.

**Το score:**
- **0 έως 1** = υγιές (1 = τυπικό)·
- **αρνητικό** = ανωμαλία. Ο αριθμός λέει πόσο μακριά από το υγιές: υπερφόρτωση ≈ −0.8, cpuhog ≈ −6, stuck ≈ −60 έως −110.

**Η ροή μιας ανωμαλίας** (πραγματικό stuck της 28/10):
1. Τρεις ανώμαλες μετρήσεις στη σειρά δίνουν `ANOMALY DETECTED!` με εξήγηση:
   `Score -55.383: p95 latency 4.59 s is above the safe level 0.25 s (objective 0.35 s); 49.3% of requests fail (5xx); safe level 0.1% (objective 1%)`
2. Ξυπνά ο agent. Βλέπεις κάθε βήμα του: τι κώδικα γράφει, τι επιστρέφει κάθε εργαλείο και την τελική απάντηση.
3. Μετά την ενέργεια τρέχει η επαλήθευση, **μόνο με δεδομένα από μετά το rollout** (v13, Α32.1): η πρώτη μέτρηση στα 20 s, και
   σε αγκύλες το παράθυρό της, που μεγαλώνει από το rollout ως το λεπτό:
   ```
   ⏳ Rollout converged after 3s (04:43:58); following the health score on data since then only, from +20s every 10s ...
      + 20s [20s] score +0.590 (1 pod(s), 57.0 rps (57.0/pod), p95 0.10 s, errors 0.0%) -> STABLE
   ```
   (το restart του stuck της 2/11 04:43 όπως θα το έβλεπε ο v13· ο v12, με το παράθυρο του λεπτού, το έβγαλε STABLE στα 60 s,
   όσο έφευγαν τα σφάλματα από πριν).
   - **Υγιής μέτρηση → STABLE αμέσως.**
   - Αν το score πέσει από την προηγούμενη περισσότερο από τον θόρυβο αυτής της σύγκρισης (`UNSTABLE: worse`), ή δεν ανέβει σε
     30 s περισσότερο από τον θόρυβο (`UNSTABLE: not improving`), ο ανιχνευτής ξαναξυπνά τον agent αμέσως, το πολύ 2 φορές στη
     σειρά. Ο θόρυβος είναι μεγαλύτερος όσο λιγότερα δεδομένα έχει η μέτρηση (0.38 στη σύγκριση +20 → +30 s, 0.10 στη
     +50 → +60 s).
   - Μετά το STABLE ο ανιχνευτής συνεχίζει αμέσως, και ως το λεπτό διαβάζει κι αυτός μόνο δεδομένα από μετά την αλλαγή.

**Επιλογές:**
- `AIOPS_MEMORY=off`: χωρίς μνήμη. Στην καμπάνια, τα σφάλματα τρέχουν χωρίς μνήμη.
- `AIOPS_ACT_GUARD=off`: χωρίς τους τρεις φραγμούς.
- `AIOPS_FALLBACK_MODEL=off`: χωρίς εφεδρικό μοντέλο (default `gemini/gemini-2.5-flash`).

**Τι να παρακολουθείς (τερματικό 3):**
```bash
kubectl get pods -l app=aiops-backend -w                 # READY 0/1 = το readiness το έβγαλε εκτός
tail -f 3-ai-agent/incident_log.csv                      # κάθε αφύπνιση: score, εξήγηση, ενέργειες, ετυμηγορία, ανάκαμψη
```
**Grafana** (`http://grafana.aiops`) ή **Prometheus**, το p95 όπως το βλέπει ο χρήστης:
`histogram_quantile(0.95, sum(rate(nginx_ingress_controller_request_duration_seconds_bucket{host="mwtback.aiops"}[1m])) by (le))`

---

## 3. Σενάριο: κανονικό φορτίο (κλιμάκωση πάνω και κάτω)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/baseline.js   # 38 λεπτά, το μετρημένο σενάριο
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/demo.js       # 22 λεπτά, γρήγορη εκδοχή
```
Ενδεικτικά, από το run της 28/10 06:31 (baseline.js):

| Πότε | Φορτίο | Τι πρέπει να δεις |
|---|---|---|
| 0–8 λεπτά | 43 → 87 rps | 1 pod, score ~1.0, καμία ενέργεια |
| ~8 λεπτά | ~96 rps | πάνω από τη ζώνη του 1 pod (87): αφύπνιση. Τα γεγονότα λένε «Minimum pod count …: 2. Current: 1», ακολουθεί `scale 1->2` και STABLE σε ~40 s |
| ~16 λεπτά | ~170 rps | πάνω από τη ζώνη των 2 pods (162): `scale 2->3` |
| ~25 λεπτά | ~114 rps | κάτω από τη ζώνη των 3 pods (124), άρα σπατάλη: `scale 3->2` |
| ~32 λεπτά | ~67 rps | κάτω από τη ζώνη των 2 pods (73): `scale 2->1` |

- **Στο κανονικό φορτίο ο agent δεν χρειάζεται εργαλεία παρατήρησης:** ταξινομεί ως «CAPACITY» και κάνει scale.
- **Μνήμη:** από το 2ο run και μετά, βλέπεις «1 similar verified past incident … scale 1->2 -> verified STABLE».
- **Αποτέλεσμα στην καμπάνια:** 0–110 s έξω από τις NFR, ανάλογα με το πόσο γρήγορα απάντησε το LLM. Το HPA έχει 0 s, αλλά
  πληρώνει ~5% περισσότερα pods.

---

## 4. Σενάριο: κολλημένη εξάρτηση (stuck)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/stuck.js   # τερματικό 2: 57 rps, 16 λεπτά, 1 pod
./4-load-testing/inject.sh stuck                                                       # τερματικό 3, στο 4ο λεπτό
```
**Τι γίνεται:**
- Κάθε αίτημα περιμένει 3 s για μια σύνδεση της βάσης και παίρνει 503.
- Το `/ready` αποτυγχάνει, και το readiness βγάζει το pod εκτός.
- Το score πέφτει από +1.00 σε −3, μετά −32, μετά −55. Στην 3η μέτρηση γίνεται η αφύπνιση, ~30 s μετά το σφάλμα.

**Τι πρέπει να κάνει ο agent:**
1. Τα ελάχιστα pods είναι ίδια με τα τωρινά (1), οπότε τρέχει την έρευνα (B).
2. `get_pod_breakdown`: το pod είναι not ready, με p95 ~4.4 s.
3. `get_deployment_history`: καμία πρόσφατη αλλαγή.
4. `get_kubernetes_logs`: `DB connection pool exhausted: waited 3000ms … (0/10 idle)`.
5. `restart_kubernetes_deployment()`, και η επαλήθευση δίνει STABLE σε ~60 s.

**Στην καμπάνια:** ανάκαμψη σε 110–120 s. Το HPA δεν ανακάμπτει ποτέ: χωρίς κίνηση η CPU πέφτει, και το liveness περνά.

---

## 5. Σενάριο: εργασία που δεν τελειώνει (cpuhog)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/cpuhog.js  # τερματικό 2
./4-load-testing/inject.sh cpuhog                                                      # τερματικό 3, στο 4ο λεπτό
```
**Τι γίνεται:**
- Μια εργασία που δεν τελειώνει ποτέ μπλοκάρει το event loop. Μοιάζει με υπερφόρτωση, αλλά το φορτίο είναι μόλις 57 rps.
- Το p95 ανεβαίνει στα ~1.5–1.8 s, ενώ τα σφάλματα μένουν ~0%. Το score πέφτει στο ~−6 έως −9.

**Τι πρέπει να κάνει ο agent:**
1. Τα ελάχιστα pods είναι ίδια με τα τωρινά, άρα έρευνα (B).
2. `get_pod_breakdown`: μεγάλο event-loop lag και CPU ανά αίτημα πολλαπλάσια του υγιούς 0.0084.
3. `get_kubernetes_logs`: `job "rebuild-search-index" still running`.
4. Restart, και STABLE.

**Στην καμπάνια:** ανάκαμψη σε 110–140 s. Το HPA πάει 1→2 pods και μένει εκεί, με p95 ~0.7 s, χωρίς ανάκαμψη: πληρώνει
διπλά και δεν λύνει τίποτα.

---

## 6. Ένα μετρημένο run με μία εντολή

```bash
SCENARIO=stuck    AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm manual-2026-10-28   # ~19 λεπτά
SCENARIO=cpuhog   AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm manual-2026-10-28   # ~19 λεπτά
SCENARIO=baseline                  ./4-load-testing/run_experiment.sh llm manual-2026-10-28   # ~41 λεπτά
SCENARIO=stuck ./4-load-testing/run_experiment.sh hpa manual-2026-10-28                       # το ίδιο με το HPA
```
Το 2ο όρισμα (`manual-2026-10-28`) μπαίνει στη στήλη `notes`, ώστε τα runs να μην ανακατεύονται με μια καμπάνια. Το script
διαβάζει μόνο του το `.env`.

**Τι κάνει:**
1. Καθαρή επαναφορά: restart, 1 pod, καθαρό ιστορικό, token pool, 120 s αναμονή.
2. Ξεκινά τη στρατηγική (agent ή HPA).
3. Τρέχει το k6 του σεναρίου· στα σφάλματα βάζει το σφάλμα στο 4ο λεπτό.
4. Σταματά και βαθμολογεί στο ingress.

**Πού γράφονται τα αποτελέσματα:**
- Φάκελος `4-load-testing/eval_[σενάριο_]στρατηγική_ώρα/`, με `score.txt`, `controller.log` (ό,τι είδε και έκανε ο agent),
  `k6.log`, `series.json`, `power.log`.
- Μία γραμμή στο `results_nfr*.csv`.
- Αναφορά για όλα τα runs με την ίδια ετικέτα:
  ```bash
  .venv/bin/python3 4-load-testing/campaign_report.py manual-2026-10-28 > 4-load-testing/manual-2026-10-28.md
  ```
  Μην τρέξεις το `compare_results.py` με άλλη ετικέτα, γιατί ξαναγράφει το `comparison_nfr.md` της καμπάνιας. Αν το κάνεις,
  ξανατρέξ' το μετά με `campaign-2026-11-01`.

---

## 7. Ολόκληρη η σύγκριση με μία εντολή (η καμπάνια)

```bash
./4-load-testing/full_campaign.sh campaign-<ημερομηνία>                                  # 4 × κάθε σενάριο, agent και HPA
NORMAL_RUNS=6 FAULT_RUNS=6 ./4-load-testing/full_campaign.sh campaign-<ημερομηνία>        # 6 × (~20 ώρες)
NORMAL_RUNS=1 FAULT_RUNS=1 ./4-load-testing/full_campaign.sh smoke-<ημερομηνία>           # δοκιμαστική (1 run από το καθένα)
```
**Πριν ξεκινήσεις:**
- laptop στην πρίζα, καπάκι ανοιχτό, μόνο Docker και ένα τερματικό·
- `llm_ready.py` απαντά·
- κανένα άλλο πείραμα δεν τρέχει.

**Τι κάνει:**
- Αδειάζει τη μνήμη.
- Εναλλάσσει runs agent και HPA, και κάθε run περιμένει ρεύμα.
- Ένα run του agent ξεκινά μόνο όταν απαντά το Gemini. Αν δεν απαντά, περιμένει έως 8 ώρες.

**Παρακολούθηση:**
```bash
grep -E "start |end   " 4-load-testing/<TAG>.log | tail      # start / end κάθε run
ls -dt 4-load-testing/eval_* | head -1                        # το τρέχον run
```
**Σταμάτημα:** `pkill -f full_campaign.sh`. Το τρέχον run τελειώνει κανονικά. Για να κοπεί κι αυτό:
`pkill -TERM -f run_experiment.sh`.

**Αποτελέσματα** (βγαίνουν αυτόματα στο τέλος· αν τη σταματήσεις, τρέξε τα δύο scripts με το χέρι):

| Αρχείο | Τι έχει |
|---|---|
| `4-load-testing/<TAG>.md` (`campaign_report.py <TAG>`) | ανά run του agent: σωστή ενέργεια στην 1η αφύπνιση, ανάκαμψη, εφεδρικό μοντέλο, μπαταρία |
| `4-load-testing/comparison_nfr.md` (`compare_results.py <TAG>`) | μέσοι όροι, στατιστικά (permutation, Fisher) |
| `4-load-testing/comparison_nfr*_timelines.png` | γραφήματα: pods, rps, κόκκινο = παραβίαση NFR |

---

## 8. Ξαναχτίσιμο του μοντέλου (μόνο αν αλλάξει η εφαρμογή, η μίξη ή τα pods)

Με τον ανιχνευτή **σβηστό** και χωρίς άλλη κίνηση:
```bash
.venv/bin/python3 5-ml-training/capacity_discovery.py       # ~75', -> capacity_table.json (1-4 pods)
.venv/bin/python3 4-load-testing/k6/make_profiles.py        # -> τα σενάρια k6 από τον πίνακα (μετά: commit)
.venv/bin/python3 5-ml-training/collect_healthy_data.py     # ~55', -> baseline_metrics_healthy.csv
.venv/bin/python3 5-ml-training/train_health_baseline.py    # δευτερόλεπτα: probes, μονοτονία, held-out, επιλογή του γ
.venv/bin/python3 reset_chroma.py                           # η μνήμη ζει στον χώρο του μοντέλου
.venv/bin/python3 4-load-testing/replay_model.py campaign-2026-10-28   # offline replay σε καταγεγραμμένα runs
./4-load-testing/detector_validation.sh && .venv/bin/python3 4-load-testing/analyze_validation.py   # ~34', ζωντανή επικύρωση
```
Μετά από νέα χωρητικότητα, άλλαξε και τον στόχο του HPA (`baselines/hpa.yaml`· το σκεπτικό στην Α25).

---

## 9. Αν κάτι πάει «στραβά»

- **Σποραδικά 502 σε POST:** λείπει η διόρθωση keep-alive (`server.js`, Α25). Ξαναχτίσε το image.
- **1 pod με πολύ λίγη κίνηση (1–4 rps):** διορθώθηκε στον v12 (Α31). Το μοντέλο έχει πλέον δεδομένα από το 1 rps, και αν
  κανένας αριθμός pods δεν είναι υγιής κάτω από κάθε ζώνη, τα γεγονότα λένε «ελάχιστο 1». Μόνο στο 1.000–1.002 rps το 1 pod
  είναι ακόμα οριακά ανωμαλία.
- **Ο agent ξανά και ξανά UNSTABLE:** δες στο `incident_log.csv` τη στήλη `verification_detail`, που έχει την πορεία του
  score, και αν τα pods είναι έτοιμα (`kubectl get pods`).
- **Gemini 503 / timeout:** η καμπάνια περιμένει μόνη της. Με το χέρι, ξαναδοκίμασε `llm_ready.py`. Στις 28/10 έλειψε για
  3 ώρες.
- **Ο laptop κοιμήθηκε ή βγήκε ο φορτιστής:** οι μετρήσεις της ώρας αυτής είναι άκυρες (`power.log`, `on_battery_s`). Τα
  scripts τρέχουν με `caffeinate`, αλλά στη μπαταρία με κλειστό καπάκι ο Mac κοιμάται.
