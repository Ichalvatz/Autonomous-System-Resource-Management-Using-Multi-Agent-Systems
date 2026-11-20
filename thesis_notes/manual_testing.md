# Οδηγός χειροκίνητων δοκιμών (φάση 2: NFR, agent v14, σύγκριση με HPA)

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

## 0. Το σύστημα σε μία ματιά (v14)

- **Τι μετράμε:** latency, σφάλματα και throughput στο **ingress**, όπως τα βλέπει ο χρήστης. NFR: p95 < 0.35 s και
  σφάλματα < 1%. Ασφαλές επίπεδο: p95 ≤ 0.25 s.
- **Φορτίο:** μίξη endpoints (30% search, 25% λεπτομέρειες τόπου, 15% reviews, 10% recommendations, 10% login, 10% εγγραφές),
  σε **αιτήματα ανά δευτερόλεπτο** (ανοιχτό μοντέλο).
- **Χωρητικότητα:** 1 pod 95 rps, 2 pods 165, 3 pods 255 (ασφαλές). Το ταβάνι είναι 3 pods.
- **Ανιχνευτής:** **ένα** One-Class SVM. Οι υγιείς ζώνες φορτίου είναι 1 pod 1–87, 2 pods 73.5–162, 3 pods 123–251 rps.
  Latency και σφάλματα μετρούν πάνω από το ασφαλές επίπεδο. Κρίνει κάθε μέτρηση, και αμέσως μετά από αλλαγή pods (v13).
- **Agent v14** (Α33, Α34): 4 εργαλεία (2 παρατήρησης: τα pods με την τελευταία αλλαγή του deployment, και τα logs των
  τελευταίων 10 λεπτών ομαδοποιημένα ανά μήνυμα· scale· restart όλης της εφαρμογής). Κάθε κλήση του LLM κόβεται στα 60 s.
  Μετά από κάθε ενέργεια ο κώδικας ακολουθεί
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
.venv/bin/python3 -m pytest 3-ai-agent/tests -q              # 107 passed
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
python 3-ai-agent/anomaly_detector.py              # ο agent v14
python 3-ai-agent/anomaly_detector.py --dry-run    # μόνο ο ανιχνευτής: χωρίς LLM, δεν αγγίζει το cluster
```
**Ή το HPA στη θέση του agent** (ποτέ και τα δύο μαζί):
```bash
kubectl apply -f 4-load-testing/baselines/hpa.yaml     # CPU 60%, 1–3 pods, scale-down μετά από 120 s
kubectl get hpa aiops-backend-hpa -w                   # TARGETS = η CPU ως % του request (1 core), REPLICAS
kubectl delete hpa aiops-backend-hpa                   # στο τέλος, πριν ξεκινήσεις τον agent
```
Κάθε 10 s τυπώνει μια γραμμή:
`rps: 57.0 (57.0/pod), p95: 0.113s, errors: 0.0%, replicas: 1 (ready 1), prediction: 1 (score +1.000)`.

**Το score:**
- **0 έως 1** = υγιές (1 = τυπικό)·
- **αρνητικό** = ανωμαλία. Ο αριθμός λέει πόσο μακριά από το υγιές: υπερφόρτωση ≈ −0.8, cpuhog ≈ −6, stuck ≈ −60 έως −110.

**Η ροή μιας ανωμαλίας** (πραγματικό stuck της καμπάνιας του v14, 8/11 20:07):
1. Τρεις ανώμαλες μετρήσεις στη σειρά δίνουν `ANOMALY DETECTED!` με εξήγηση:
   `Score -69.045: p95 latency 4.58 s is above the safe level 0.25 s (objective 0.35 s); 61.8% of requests fail (5xx); safe level 0.1% (objective 1%)`
2. Ξυπνά ο agent. Βλέπεις κάθε βήμα του: τι κώδικα γράφει, τι επιστρέφει κάθε εργαλείο και την τελική απάντηση.
3. Μετά την ενέργεια τρέχει η επαλήθευση, **μόνο με δεδομένα από μετά το rollout** (v13, Α32.1): η πρώτη μέτρηση στα 20 s, και
   σε αγκύλες το παράθυρό της, που μεγαλώνει από το rollout ως το λεπτό:
   ```
   ⏳ Rollout converged after 9s (20:07:49); following the health score on data since then only, from +20s every 10s ...
      + 20s [20s] score +0.585 (1 pod(s), 57.5 rps (57.5/pod), p95 0.12 s, errors 0.0%) -> STABLE
   ```
   (ο v12, με το παράθυρο του λεπτού, έβγαζε ένα τέτοιο restart STABLE στα 60 s, όσο έφευγαν τα σφάλματα από πριν).
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

## Τα σενάρια με μία εντολή (`4-load-testing/manual/`, από 20/11)

```bash
cd 4-load-testing/manual
k6 run baseline.js     # 1 → 2 → 3 → 2 → 1 pods, 38 λεπτά (το μετρημένο σενάριο)
k6 run demo.js         # το ίδιο σχήμα, 22 λεπτά
k6 run stuck.js        # 57 rps σε 1 pod, 16 λεπτά· το σφάλμα μπαίνει μόνο του στο 4ο λεπτό
k6 run cpuhog.js       # το ίδιο, με το cpuhog
```
- **Πότε μπαίνει το σφάλμα:** `-e FAULT_AT=1m` το φέρνει νωρίτερα. Στο `baseline.js` / `demo.js` μπαίνει σφάλμα μόνο αν
  το ζητήσεις: `k6 run -e FAULT=cpuhog -e FAULT_AT=6m baseline.js` (§5α).
- **Τι στέλνει:** ένα `POST /chaos/<σφάλμα>` μέσα από το ingress, και το k6 το τυπώνει: `INJECT stuck: {"stuck":true,…}`.
  Φτάνει σε **ένα** pod. Είναι ίδιο με το `inject.sh` όταν υπάρχει ένα pod, όπως στα σενάρια (57 rps στο 4ο λεπτό, ~56 rps
  στο 6ο λεπτό του baseline). Αν υπάρχουν ήδη περισσότερα, το `inject.sh` τα πιάνει όλα.
- **Το φορτίο είναι ακριβώς των μετρημένων σεναρίων:** τα scripts παίρνουν τα options από το `4-load-testing/k6/`, που μένει
  ίδιο. Είναι «παγωμένο», γιατί κάθε αναφορά καμπάνιας ελέγχει το sha256 του, και στα μετρημένα runs το σφάλμα το βάζει το
  `run_experiment.sh`.
- **Πριν από κάθε σφάλμα:** `./4-load-testing/inject.sh reset`. Το σφάλμα μένει στο pod ώσπου να γίνει restart, άρα και μετά
  από ένα run με το HPA ή χωρίς agent.
- **Τα logins:** `-e TOKENS_FILE=$PWD/../../5-ml-training/k6_tokens.json` παίρνει τους χρήστες από το token pool (§1).
  Χωρίς αυτό, το k6 κάνει 20 logins μαζί στην αρχή.

Οι εντολές παρακάτω είναι οι ίδιες από τη ρίζα του repo, με το σφάλμα από τρίτο τερματικό.

## 3. Σενάριο: κανονικό φορτίο (κλιμάκωση πάνω και κάτω)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/baseline.js   # 38 λεπτά, το μετρημένο σενάριο
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/demo.js       # 22 λεπτά, γρήγορη εκδοχή
```
Ενδεικτικά, από το run του agent v14 της 8/11 14:45 (baseline.js):

| Πότε | Φορτίο | Τι πρέπει να δεις |
|---|---|---|
| 0–8 λεπτά | 43 → 87 rps | 1 pod, score ~1.0, καμία ενέργεια |
| ~8 λεπτά | ~96 rps | πάνω από τη ζώνη του 1 pod (87): αφύπνιση. Τα γεγονότα λένε «Minimum pod count …: 2. Current: 1», ακολουθεί `scale 1->2` και STABLE στην πρώτη μέτρηση, 20 s μετά το rollout |
| ~16 λεπτά | ~170 rps | πάνω από τη ζώνη των 2 pods (162): `scale 2->3` |
| ~25 λεπτά | ~114 rps | κάτω από τη ζώνη των 3 pods (124), άρα σπατάλη: `scale 3->2` |
| ~32 λεπτά | ~67 rps | κάτω από τη ζώνη των 2 pods (73): `scale 2->1` |

- **Στο κανονικό φορτίο ο agent δεν χρειάζεται εργαλεία παρατήρησης:** ταξινομεί ως «CAPACITY» και κάνει scale.
- **Μνήμη:** από το 2ο run και μετά, βλέπεις «1 similar verified past incident … scale 1->2 -> verified STABLE».
- **Αποτέλεσμα στην καμπάνια του v14:** 0–80 s έξω από τις NFR, μόνο γύρω από τα scale-up (Α34). Το HPA κλιμακώνει νωρίτερα
  (1→2 στα 70–80 rps) και πληρώνει 7.5% περισσότερα pods· είχε 0–100 s, από σύντομα παγώματα του μηχανήματος.

---

## 4. Σενάριο: κολλημένη εξάρτηση (stuck)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/stuck.js   # τερματικό 2: 57 rps, 16 λεπτά, 1 pod
./4-load-testing/inject.sh stuck                                                       # τερματικό 3, στο 4ο λεπτό
```
**Τι γίνεται:**
- Κάθε αίτημα περιμένει 3 s για μια σύνδεση της βάσης και παίρνει 503.
- Το `/ready` αποτυγχάνει, και το readiness βγάζει το pod εκτός.
- Το score πέφτει από +0.59 (το υγιές του 1 pod στα 57 rps) σε −20, μετά −47, μετά −69 (8/11 20:07). Στην 3η μέτρηση γίνεται
  η αφύπνιση, ~40 s μετά το σφάλμα.

**Τι πρέπει να κάνει ο agent** (v14, Α34: η έρευνα με δύο εργαλεία, δεδομένα και logs):
1. Τα ελάχιστα pods είναι ίδια με τα τωρινά (1), οπότε τρέχει την έρευνα (B).
2. `get_pod_breakdown`: το pod είναι not ready, με p95 ~4.4 s. Η γραμμή «Deployment:» δείχνει ότι το template δεν άλλαξε
   πρόσφατα.
3. `get_kubernetes_logs`: οι ομάδες `DB connection pool exhausted: waited 3000ms … (0/10 idle …)` και
   `Server error (5xx): 503`, με πρώτη φορά λίγο μετά το inject και σε όλα τα endpoints. Σπάνιο αίτημα δεν υπάρχει, γιατί
   το inject δεν αφήνει ίχνος στα logs.
4. `restart_kubernetes_deployment()`, και η επαλήθευση δίνει STABLE στην πρώτη μέτρηση, 20 s μετά το rollout.

Το inject δεν το κάνει το `k6/stuck.js`: το τρέχεις εσύ στο 4ο λεπτό (στα runs της καμπάνιας το κάνει το
`run_experiment.sh`). Το `manual/stuck.js` το κάνει μόνο του (πάνω).

**Στην καμπάνια του v14:** ανάκαμψη σε 110–150 s (125 s κατά μέσο όρο). Το HPA δεν ανακάμπτει ποτέ: χωρίς κίνηση η CPU πέφτει,
και το liveness περνά.

---

## 5. Σενάριο: εργασία που δεν τελειώνει (cpuhog)

```bash
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/cpuhog.js  # τερματικό 2
./4-load-testing/inject.sh cpuhog                                                      # τερματικό 3, στο 4ο λεπτό
```
**Τι γίνεται:**
- Μια εργασία που δεν τελειώνει ποτέ μπλοκάρει το event loop. Μοιάζει με υπερφόρτωση, αλλά το φορτίο είναι μόλις 57 rps.
- Το p95 ανεβαίνει στα ~1.3–1.8 s, ενώ τα σφάλματα μένουν ~0–4%. Το score πέφτει στο ~−4 έως −9 (8/11 21:12: −3.8, −4.9,
  −6.7 στην αφύπνιση).

**Τι πρέπει να κάνει ο agent:**
1. Τα ελάχιστα pods είναι ίδια με τα τωρινά, άρα έρευνα (B).
2. `get_pod_breakdown`: event-loop lag p99 πάνω από 1 s (υγιές ~0.085 s, max 0.39)· η CPU ανά αίτημα ανεβαίνει λίγο (0.013
   έναντι 0.0084), γιατί η CPU της εργασίας μοιράζεται στα αιτήματα.
3. `get_kubernetes_logs`: η ομάδα `job "rebuild-search-index" started` (μία φορά, στην ώρα του inject), μετά `still
   running after 11s (iteration 10, expected 1)`, και `High latency detected` κυρίως στο `POST /auth/login`. (Ως τις 18/11
   η γραμμή τελείωνε και με «; event loop blocked 600ms per iteration», που έλεγε μόνη της τη διάγνωση· η καμπάνια του v14
   έτρεξε με εκείνη.)
4. Restart, και STABLE.

**Στην καμπάνια του v14:** ανάκαμψη σε 100–110 s. Το HPA πάει 1→2 pods και μένει εκεί, με p95 ~0.7 s, χωρίς ανάκαμψη:
πληρώνει διπλά και δεν λύνει τίποτα. Με τη νέα γραμμή (18/11, 2 runs): restart 2 / 2, ανάκαμψη 110 s.

---

## 5α. Σενάριο: σφάλμα πάνω στη ράμπα (UNSTABLE και ξαναξύπνημα)

Εδώ βλέπεις τι γίνεται όταν η πρώτη κίνηση του agent δεν πιάνει. Το cpuhog μπαίνει την ώρα που το φορτίο ανεβαίνει.

```bash
python 3-ai-agent/anomaly_detector.py                                                    # τερματικό 1 (μνήμη on ή AIOPS_MEMORY=off)
k6 run -e TOKENS_FILE=$PWD/5-ml-training/k6_tokens.json 4-load-testing/k6/baseline.js    # τερματικό 2
./4-load-testing/inject.sh cpuhog                                                        # τερματικό 3, στο 6ο λεπτό του k6
```

**Τι γίνεται** (το run της 18/11 13:08, `eval_llm_20261118_1308/controller.log`):
1. Στο 6ο λεπτό το φορτίο είναι ~56 rps και ανεβαίνει ~17 rps/λεπτό. Το cpuhog ανεβάζει το p95 στα 1.5–1.7 s, και ο agent
   ξυπνά σε ~30 s.
2. **Τα γεγονότα τραβούν προς δύο μεριές.** Λένε «ελάχιστο 2» (η τάση φτάνει τα 88 rps σε 90 s, πάνω από τη ζώνη του 1 pod)
   και «το φορτίο είναι μέσα στη ζώνη του 1 pod, άρα μόνο του δεν εξηγεί το latency».
3. **Αν ακολουθήσει τον κανόνα A** (scale 1→2 χωρίς έρευνα): το νέο pod είναι υγιές, αλλά το παλιό, με το job, παίρνει ακόμα
   τη μισή κίνηση. Η επαλήθευση δείχνει `-5.29 -> -5.06 -> -5.06 -> -4.95`, άνοδο 0.33 σε 30 s με θόρυβο 0.47, άρα
   `UNSTABLE: not improving` στα +50 s.
4. **Στην επόμενη ανώμαλη μέτρηση (10 s μετά)** βλέπεις `RE-WAKE: the last action did not help`, χωρίς τις 3 μετρήσεις και
   χωρίς cooldown. Το μήνυμα του agent έχει πια:
   - `Your recent actions: … scale 1->2; verification: UNSTABLE: not improving`
   - «ελάχιστο 1, τωρινό 2». Το scale-down του κανόνα A ισχύει μόνο όταν οι NFR τηρούνται, και εδώ δεν τηρούνται.

   Ερευνά λοιπόν:
   - `get_pod_breakdown`: ένα pod με lag 1.11 s και CPU 1.00, το νέο με 0.08 s·
   - `get_kubernetes_logs`: `job "rebuild-search-index" started` / `still running`.

   Ακολουθεί restart, και STABLE στα +20 s. Από το σφάλμα ως το STABLE πέρασαν 2:15.
5. **Μπορεί να μη το δεις:** στο 2ο run της 18/11, με τα ίδια γεγονότα, ο agent ερεύνησε κατευθείαν και έκανε restart (1:23).
   Ο δρόμος αλλάζει από run σε run. Αν θέλεις οπωσδήποτε το UNSTABLE, ξανατρέξε· στις 18/11 βγήκε 1 στις 2.

**Κόστος:** ~6–12 κλήσεις Gemini για κάθε δοκιμή (2 για το scale, 4 για την έρευνα με το restart, 2 για κάθε επόμενο scale
της ράμπας). Μπορείς να σταματήσεις το k6 μετά το STABLE. Μετρημένη εκδοχή, ίδια με αυτή της 18/11:
`archive/memory_tests_2026-11-09.sh`, τεστ 3–4: `SCENARIO=baseline run_experiment.sh llm`, και `inject.sh cpuhog` 6 λεπτά
μετά το «k6 baseline.js started».

---

## 6. Ένα μετρημένο run με μία εντολή

```bash
SCENARIO=stuck    AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm manual-2026-11-09   # ~19 λεπτά
SCENARIO=cpuhog   AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm manual-2026-11-09   # ~19 λεπτά
SCENARIO=baseline                  ./4-load-testing/run_experiment.sh llm manual-2026-11-09   # ~41 λεπτά
SCENARIO=stuck ./4-load-testing/run_experiment.sh hpa manual-2026-11-09                       # το ίδιο με το HPA
```
Το 2ο όρισμα (`manual-2026-11-09`) μπαίνει στη στήλη `notes`, ώστε τα runs να μην ανακατεύονται με μια καμπάνια. Το script
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
  .venv/bin/python3 4-load-testing/campaign_report.py manual-2026-11-09 > 4-load-testing/manual-2026-11-09.md
  ```
  Μην τρέξεις το `compare_results.py` με άλλη ετικέτα, γιατί ξαναγράφει το `comparison_nfr.md` της καμπάνιας. Αν το κάνεις,
  ξανατρέξ' το μετά με `campaign-v14-2026-11-08`.

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
