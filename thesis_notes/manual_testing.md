# Οδηγός χειροκίνητων δοκιμών

Πώς τρέχεις και ελέγχεις μόνος σου κάθε σενάριο, βήμα-βήμα. Όλες οι εντολές από τη ρίζα του repo
(`~/Documents/LLM_AGENT`), σε macOS / zsh. Χρειάζεσαι **3 τερματικά**: (1) agent, (2) φορτίο k6, (3) εντολές/παρατήρηση.

> **Σημαντικό:** όσο τρέχουν αυτόματα πειράματα (`pgrep -fl "full_campaign|campaign_rerun|queue|run_experiment"`),
> **μην** κάνεις χειροκίνητες δοκιμές: δύο controllers στο ίδιο deployment «μάχονται» και χαλάνε και τα δύο.
>
> Θες ολόκληρη τη σύγκριση (agent + όλα τα baselines, όλα τα σενάρια) με μία εντολή; Πήγαινε στην **ενότητα 9**.

---

## 0. Προετοιμασία (μία φορά)

```bash
# Είναι όλα πάνω;
docker info >/dev/null && kind get clusters            # πρέπει να δείξει: aiops-cluster
kubectl get pods -A | grep -v Running                  # μόνο η κεφαλίδα = όλα Running
grep aiops /etc/hosts                                  # mwtback / prometheus / grafana / chromadb .aiops → 127.0.0.1
curl -s -o /dev/null -w "%{http_code}\n" http://prometheus.aiops/-/ready     # 200

source .venv/bin/activate
export GEMINI_API_KEY=...        # το κλειδί σου (το .env ΔΕΝ φορτώνεται αυτόματα)
.venv/bin/python3 -m pytest 3-ai-agent/tests -q        # 83 passed
```

### Επαναφορά σε καθαρή κατάσταση (πριν από κάθε σενάριο)
```bash
D=deploy/aiops-backend-deployment
kubectl set env $D FEATURE_LOGIN_AUDIT- 2>/dev/null    # βγάζει το badconfig αν έμεινε
kubectl rollout restart $D                             # φρέσκα pods (καθαρίζει stuck/cpuhog)
kubectl scale $D --replicas=1
kubectl rollout status $D
```
Περίμενε ~2 λεπτά πριν ξεκινήσεις (ο ανιχνευτής αγνοεί τις μετρήσεις 90 s μετά από αλλαγή pods).

---

### Συντόμευση: `4-load-testing/inject.sh`
```bash
./4-load-testing/inject.sh status      # replicas, pods, revision, αν υπάρχει η κακή ρύθμιση
./4-load-testing/inject.sh stuck       # ή: cpuhog, badconfig
./4-load-testing/inject.sh reset       # επαναφορά (βγάζει την κακή ρύθμιση, restart, 1 pod)
```
Οι παρακάτω ενότητες δείχνουν και τις «ωμές» εντολές, για να ξέρεις τι κάνει.

## 1. Ξεκίνα τον agent (τερματικό 1)

```bash
python 3-ai-agent/anomaly_detector.py        # η τελική έκδοση (v8.1, η μόνη στον κώδικα)
# χωρίς LLM, μόνο ο ανιχνευτής (δεν αγγίζει το cluster):
python 3-ai-agent/anomaly_detector.py --dry-run
```
Κάθε 10 s τυπώνει μια γραμμή `cpu: …, latency: …, prediction: 1 (score …)`. `prediction: -1` = ανώμαλη μέτρηση· 3 στη σειρά
→ `ANOMALY DETECTED!` → ξυπνά ο agent και βλέπεις **όλα** τα βήματά του (τι κώδικα έγραψε, τι είδε, τι έκανε), μετά
`Verifying...` και `STABLE`/`UNSTABLE`.

**Εφεδρικό μοντέλο:** από 4/10 είναι default το `gemini/gemini-2.5-flash` (ίδιο κλειδί): αν το κύριο μοντέλο αποτύχει
4 φορές (503 «high demand», κενές απαντήσεις), ο agent συνεχίζει με αυτό. `AIOPS_FALLBACK_MODEL=off` για να το κλείσεις
(έτσι έτρεξαν τα μετρημένα runs του v8, 3–4/10· στην καμπάνια της 21–22/10 ήταν ανοιχτό και χρησιμοποιήθηκε σε 2 από τα
12 runs, σημειωμένα στην αναφορά). Αν το κύριο μοντέλο απαντά τώρα: `python 4-load-testing/llm_ready.py` (3 κλήσεις, το
κλειδί δεν τυπώνεται).
(Ελέγχθηκε 2026-10-03: απαντά σε ~0.6 s. Το `gemini-2.5-flash-lite` έχει αποσυρθεί, το pro δίνει 429 στο δωρεάν tier.)

Επιλογές: `AIOPS_MEMORY=off` (χωρίς μνήμη), `AIOPS_ACT_GUARD=off` (χωρίς τους φραγμούς: και τους τρεις στο v8),
Οι παλιές εκδόσεις (v4–v7) δεν είναι πια στον κώδικα· πώς ξανατρέχουν: `thesis_notes/removed_and_archived.md`.

**Τι να παρακολουθείς (τερματικό 3):**
```bash
kubectl get pods -l app=aiops-backend -w                       # pods που έρχονται/φεύγουν
kubectl get deploy aiops-backend-deployment -w                 # replicas
tail -f 3-ai-agent/incident_log.csv                            # κάθε περιστατικό: ενέργειες, ετυμηγορία, χρόνοι
python 4-load-testing/analyze_agent_steps.py llm-v8.1 v8.1      # (μετά) βήμα-βήμα ανάλυση των περιστατικών των runs
```
Και στο browser: `http://grafana.aiops` ή `http://prometheus.aiops/graph` με π.χ.
`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))`.

---

## 2. Σενάριο: κανονικό φορτίο (κλιμάκωση πάνω και κάτω)

```bash
k6 run 4-load-testing/k6/baseline.js      # 38 λεπτά, το μετρημένο σενάριο
k6 run 4-load-testing/k6/demo.js          # 22 λεπτά, η δική σου πιο γρήγορη εκδοχή
```
**Τι πρέπει να δεις (k6/baseline.js):**
| Λεπτό | Φορτίο | Αναμενόμενο |
|---|---|---|
| 0–5 | 5 χρήστες | καμία ενέργεια (1 pod) |
| ~6–9 | 20 χρήστες | αφύπνιση → «CAPACITY» → `scale 1->2` → STABLE |
| ~14–17 | 30 χρήστες | `scale 2->3` → STABLE |
| ~22–26 | 14 χρήστες | σπατάλη → `scale 3->2` |
| ~30–34 | 5 χρήστες | `scale 2->1` |
Ο agent (v8.1) σε αυτά συνήθως **δεν** χρειάζεται tools παρατήρησης (τα υπολογισμένα γεγονότα λένε «CPU ανά αίτημα ≈ 1×»).
Χρήστες: p95 < 0.35 s σχεδόν όλη την ώρα.

---

## 3. Σενάριο: κολλημένη εξάρτηση (stuck)

```bash
# τερματικό 2: σταθερό φορτίο 8 χρηστών
k6 run 4-load-testing/k6/stuck.js
# τερματικό 3, μετά από ~3 λεπτά: «σπάσε» κάθε pod
for p in $(kubectl get pods -l app=aiops-backend -o name); do
  kubectl exec $p -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/stuck; echo; done
```
**Τι πρέπει να δεις:** p95 ~3 s, CPU **πέφτει**. Σε ~1 λεπτό αφύπνιση → «SOMETHING ELSE» (καθυστέρηση ψηλά με CPU σε
αδράνεια) → `get_pod_breakdown` → `get_deployment_history` → `get_kubernetes_logs` (γραμμές `DB connection pool exhausted`) →
`restart_kubernetes_deployment()` → STABLE. Ανάκαμψη ~2 λεπτά.
**Λάθος συμπεριφορά που θα πρόσεχα:** scale-up (περισσότερα pods δεν βοηθούν όταν η CPU είναι σε αδράνεια).

---

## 4. Σενάριο: runaway background job (cpuhog)

```bash
k6 run 4-load-testing/k6/cpuhog.js        # τερματικό 2
for p in $(kubectl get pods -l app=aiops-backend -o name); do      # τερματικό 3, μετά από ~3'
  kubectl exec $p -- wget -qO- --post-data='' http://127.0.0.1:3001/chaos/cpuhog; echo; done
```
**Τι πρέπει να δεις:** CPU ~0.9, throttling ~18%, μόνο ~4 rps. Τα γεγονότα λένε «CPU per request ≈ 3× the healthy
reference» → «SOMETHING ELSE» → `get_pod_breakdown` (event-loop lag ~1 s) → logs (`job "rebuild-search-index" still
running`) → `restart_kubernetes_deployment()` → STABLE.
**Λάθος συμπεριφορά:** scale-up (μοιάζει με υπερφόρτωση) και μετά scale-down (μετά το scale-up το p95 του server
«φαίνεται» υγιές). Αυτό ακριβώς έκανε το v4.
**Προσοχή:** εδώ το p95 του server ξεγελά (δεν μετρά την αναμονή πίσω από το μπλοκαρισμένο event loop)· κοίτα την
έξοδο του k6 (`http_req_duration p(95)`) για ό,τι ένιωσαν οι χρήστες.

---

## 5. Σενάριο: κακή αλλαγή ρύθμισης (badconfig)

```bash
k6 run 4-load-testing/k6/badconfig.js     # τερματικό 2
kubectl set env deploy/aiops-backend-deployment FEATURE_LOGIN_AUDIT=true    # τερματικό 3, μετά από ~3'
```
**Τι πρέπει να δεις:** κάθε login ~0.35 s, CPU ανά αίτημα ~5× σε **όλα** τα pods, logs χωρίς σφάλματα. Αφύπνιση →
«SOMETHING ELSE» → `get_deployment_history()` δείχνει «revision N (CURRENT), πριν ~1': env FEATURE_LOGIN_AUDIT=true
added» → `rollback_kubernetes_deployment()` → STABLE. Ανάκαμψη ~2 λεπτά.
**Λάθος συμπεριφορά:** restart (τα νέα pods γεννιούνται με την ίδια κακή ρύθμιση) ή scale-up (κάθε login κοστίζει 0.35 s,
άρα το SLO δεν επανέρχεται). Αυτά ακριβώς κάνουν το rules-v2 και το HPA.
Επαναφορά αν ο agent δεν το διόρθωσε: `kubectl set env deploy/aiops-backend-deployment FEATURE_LOGIN_AUDIT-`.

---

## 6. Σύγκριση με τα baselines (προαιρετικά)
```bash
kubectl apply -f 4-load-testing/baselines/hpa.yaml      # HPA (σβήσ' το μετά: kubectl delete hpa aiops-backend-hpa)
python 3-ai-agent/rule_scaler.py                        # rules v1
RULES_RESTART=on python 3-ai-agent/rule_scaler.py       # rules v2 (με κανόνες restart)
```
Ένας controller κάθε φορά (όχι μαζί με τον agent).

Ή ολόκληρο πείραμα με βαθμολόγηση, αυτόματα: `SCENARIO=badconfig LABEL=δοκιμή ./4-load-testing/run_experiment.sh llm`
(γράφει μια γραμμή στο `evaluation_results_badconfig.csv` και ο φάκελος `eval_…` έχει όλα τα logs).

---

## 7. Δικό σου τυφλό τεστ (η πιο τίμια απόδειξη γενίκευσης)
1. **Μην αλλάξεις τον agent** μετά από αυτό το σημείο (σημείωσε `shasum -a 256 3-ai-agent/agent*.py`).
2. Σκέψου ένα σφάλμα που δεν έχουμε δοκιμάσει (π.χ. ένα endpoint που πετάει 500 σε κάθε 3ο αίτημα, μια διαρροή μνήμης,
   λάθος τιμή σε μια ρύθμιση). Πρόσθεσέ το στην εφαρμογή (όπως το `/chaos/cpuhog` στο `app.js`), ξαναχτίσε το image:
   `docker build -t aiops-backend:latest 2-target-app/software-backend/ && kind load docker-image aiops-backend:latest --name aiops-cluster && kubectl rollout restart deploy/aiops-backend-deployment`.
3. **Γράψε πριν** τι περιμένεις να κάνει ο agent και ποια είναι η σωστή ενέργεια.
4. Τρέξ' το 2–3 φορές και κατέγραψε τι έγινε, όποιο κι αν είναι το αποτέλεσμα.
Σημείωση: ο ανιχνευτής βλέπει μόνο CPU, rps, p95 και throttling. Ένα σφάλμα που δεν αλλάζει κανένα από αυτά (π.χ. 500άρια
που απαντώνται γρήγορα) δεν θα ξυπνήσει καν τον agent· αυτό είναι κι αυτό εύρημα.

---

## 8. Αν κάτι πάει «στραβά»
| Βλέπεις | Σημαίνει |
|---|---|
| `502` για 1–3 s μετά από restart/rollback/scale | το backend δεν έχει readiness probe· γνωστό, ίδιο για όλες τις στρατηγικές |
| `Metrics unavailable … returned no result` | φρέσκο pod χωρίς αρκετά δείγματα ακόμα· περνά σε ~1' |
| `⚠️ [LLM] ServiceUnavailableError … retry 1/3` | 503 του Gemini· ξαναδοκιμάζει μόνο του |
| `Refused (evidence before action)` | φραγμός: το LLM προσπάθησε να ενεργήσει πριν δει τα στοιχεία |
| `Refused (diagnosis first) … Still missing: …` | φραγμός του v8: restart/rollback πριν δει και τα 3 tools παρατήρησης· θα τα δει και θα ξαναδοκιμάσει |
| `Refused: no action tool was executed` | ο δεύτερος φραγμός: το LLM δήλωσε ενέργεια χωρίς να την κάνει |
| `Safety cooldown: … blocked` | ο φραγμός χρόνου των tools |
| `Incident memory unavailable` | ChromaDB δεν απαντά· ο agent συνεχίζει χωρίς μνήμη |
| Ο agent ξυπνά σε υγιές φορτίο | πιθανός θόρυβος host (κλείσε Safari και antivirus, άφησε το laptop να ηρεμήσει) |

**Μνήμη:** για να ξεκινήσεις από άδεια μνήμη, κράτα πρώτα αντίγραφο:
`python 3-ai-agent/memory_snapshot.py save my_backup.json` και μετά `python reset_chroma.py` (σβήνει τα πάντα).
Επαναφορά: `python 3-ai-agent/memory_snapshot.py restore my_backup.json`.

---

## 9. Ολόκληρη η σύγκριση με μία εντολή (η καμπάνια)

Έτσι μετρήθηκε το v8.1 στις 21–22/10/2026 (`4-load-testing/campaign-2026-10-21.md`). Το ίδιο script ξαναχρησιμοποιείται
για κάθε μελλοντική έκδοση του agent (π.χ. άλλο LLM) ή δεύτερη εφαρμογή.

**Τι τρέχει:** 26 runs, το καθένα μέσω του `run_experiment.sh`:
1. καθαρή επαναφορά: rolling restart, 1 pod (ή 3 για static-3) και 2' αδράνεια·
2. ξεκινά **μία** στρατηγική·
3. τρέχει το k6 του σεναρίου (το fault μπαίνει στο λεπτό 4)·
4. σταματά τη στρατηγική και βαθμολογεί το run.

| Ποιος | Σενάρια | Runs |
|---|---|---|
| agent (`llm-v8.1`) | stuck, cpuhog, badconfig, κανονικό φορτίο | 3 × 4 = 12 (μνήμη off στα faults, on στο κανονικό) |
| HPA, rules, rules-v2 | τα ίδια 4 | 3 × 4 = 12 |
| static-1, static-3 | κανονικό φορτίο | 2 |

Τα runs του agent και των baselines εναλλάσσονται. Διάρκεια ~13 ώρες: ~45' κάθε κανονικό φορτίο, ~22' κάθε fault, 3'
αδράνεια ανάμεσα.

### 9.1 Πριν ξεκινήσεις (έλεγχος)
```bash
pgrep -fl "full_campaign|campaign_rerun|run_experiment|anomaly_detector|rule_scaler"   # τίποτα δεν πρέπει να τρέχει
kubectl get pods -A | grep -v Running        # μόνο η κεφαλίδα
kubectl top pods                             # δουλεύει = υπάρχει metrics-server (το χρειάζεται το HPA)
pmset -g batt | head -1                      # "AC Power" (στη μπαταρία το macOS κόβει CPU: άλλα νούμερα)
.venv/bin/python3 -m pytest 3-ai-agent/tests -q     # 83 passed
.venv/bin/python3 4-load-testing/llm_ready.py       # "answered 3/3" (αν όχι, η καμπάνια τρέχει πρώτα baselines)
```
Κλείσε Safari, antivirus κ.λπ.: ο φόρτος του host αλλάζει την CPU ανά αίτημα (CLAUDE.md, «Host load matters»). Άφησε το
laptop **ανοιχτό και στο ρεύμα**: το script κρατά τον υπολογιστή ξύπνιο (`caffeinate`), αλλά αν πάει στη μπαταρία κάθε run
περιμένει να ξαναμπεί στην πρίζα. **Μην αλλάξεις κώδικα του agent, μοντέλο ή k6 όσο τρέχει.** Η αναφορά συγκρίνει τα sha256
στην αρχή και στο τέλος και γράφει «ΟΧΙ, άλλαξαν: …» αν άλλαξε κάτι.

### 9.2 Ξεκίνα
```bash
nohup ./4-load-testing/full_campaign.sh campaign-$(date +%F) > 4-load-testing/campaign.nohup 2>&1 &
# επιλογές: LLM_RUNS=1 (1 run ανά σενάριο, ~6 ώρες) · MAX_WAIT_H=8 (πόσο περιμένει το LLM όταν μείνουν μόνο runs του agent)
```
Το όνομα (TAG) μπαίνει στη στήλη `notes` κάθε γραμμής των CSV· έτσι η αναφορά ξεχωρίζει τα runs αυτής της καμπάνιας.

### 9.3 Παρακολούθηση
```bash
T=campaign-2026-10-21                                      # το TAG σου
grep -v "^[0-9a-f]\{64\}" 4-load-testing/$T.log | tail     # start/end κάθε run, αναμονές για LLM ή ρεύμα
tail -40 4-load-testing/$T.log.runs                        # η βαθμολογία του τελευταίου run
.venv/bin/python3 4-load-testing/campaign_report.py $T | less   # η αναφορά ως τώρα (δεν γράφει τίποτα)
tail -f 4-load-testing/eval_*_$(date +%Y%m%d)_*/controller.log  # τι κάνει τώρα ο controller (για τον agent: κάθε βήμα)
```
| Γραμμή στο log | Σημαίνει |
|---|---|
| `llm_ready: … not ready (ServiceUnavailableError, try 1)` | το κύριο μοντέλο δεν απαντά· τρέχει baseline στη θέση του |
| `only agent runs left and the primary model is unavailable` | ξαναδοκιμάζει κάθε 5', ως `MAX_WAIT_H` |
| `on battery: waiting for AC power` | βάλε το laptop στην πρίζα |
| `end … (exit 0)` | το run τελείωσε και βαθμολογήθηκε |

**Σταμάτημα:** `pkill -f full_campaign.sh; pkill -TERM -f run_experiment.sh`. Τα runs που τελείωσαν μένουν στα CSV.

### 9.4 Τα αποτελέσματα
| Αρχείο | Τι έχει |
|---|---|
| `4-load-testing/<TAG>.md` | **η αναφορά**: έλυσε ο agent κάθε σενάριο (σωστή ενέργεια στην 1η αφύπνιση, ανάκαμψη, χρόνοι), πίνακες ανά σενάριο για όλες τις μεθόδους, κάθε περιστατικό του agent με τη ρίζα που έγραψε, χρήση εφεδρικού μοντέλου, αρνήσεις φραγμών, άκυρα runs |
| `4-load-testing/comparison.md`, `comparison*_timelines.png` | όλα τα runs όλων των εκδόσεων, στατιστικά (permutation, Fisher) και χρονογραμμές |
| `4-load-testing/evaluation_results*.csv` | μία γραμμή ανά run (`notes` = TAG, `run_dir` = ο φάκελός του) |
| `4-load-testing/eval_<σενάριο>_<μέθοδος>_<ώρα>/` (κανονικό φορτίο: `eval_<μέθοδος>_<ώρα>/`) | `controller.log` (κάθε βήμα του agent ή των rules), `k6.log` (τι ένιωσαν οι χρήστες), `experiment.log` (πότε μπήκε το fault, σε ποιο pod), `series.json` (οι χρονοσειρές), `score.txt` |
| `3-ai-agent/incident_log.csv` | κάθε αφύπνιση του agent: μετρικές, ενέργειες, ετυμηγορία, κλήσεις LLM, επαναλήψεις, fallback, δευτερόλεπτα |

**Ο έλεγχος που κάνει η αναφορά για κάθε run του agent:**
- **κανονικό φορτίο:** 0 s παραβίαση SLO, 4 κλιμακώσεις, όλες STABLE·
- **stuck και cpuhog:** restart στην 1η αφύπνιση και STABLE·
- **badconfig:** rollback στην 1η αφύπνιση και STABLE.

Τα runs των άλλων μεθόδων συγκρίνονται με το `recovery_s` (για το cpuhog με το `cpu_recovery_s`, γιατί εκεί το p95 του
server ξεγελά, βλ. §4).

**Το Prometheus κρατά μόνο 10 ημέρες.** Γι' αυτό κάθε run σώζει τις χρονοσειρές του στο `series.json`. Μην σβήσεις τους
φακέλους `eval_*`: είναι το μόνο αντίγραφο.

### 9.5 Όταν ένα run είναι άκυρο ή θες επιπλέον runs
1. **Στο CSV άλλαξε την ετικέτα** σε `<μέθοδος>-INVALID`, π.χ. `hpa` → `hpa-INVALID`. Το run μένει καταγεγραμμένο, αλλά
   βγαίνει από πίνακες και στατιστικά. Γράψε στον φάκελό του ένα `INVALID.txt` με την αιτία.
2. **Ξανάτρεξέ το** με το ίδιο TAG. Αν τρέχει ακόμα η καμπάνια, ο επόμενος περιμένει να τελειώσει:
   ```bash
   nohup ./4-load-testing/campaign_rerun.sh <TAG> baseline:hpa stuck:llm > /dev/null 2>&1 &
   # αν τρέχει ήδη άλλο campaign_rerun: AFTER_PID=<το pid του> nohup ./4-load-testing/campaign_rerun.sh …
   ```
   Τα runs του agent (`:llm`) περιμένουν, όπως και στην καμπάνια, να απαντήσει το κύριο μοντέλο. Στο τέλος ξαναβγαίνουν
   οι αναφορές.

**Δύο περιπτώσεις από τις 21–22/10:**
- **Ένα run κληρονόμησε το fault του προηγούμενου.** Το reset έκανε restart μόνο στα fault runs, και ένα κολλημένο pod
  πέρασε στο επόμενο run κανονικού φορτίου. Διορθώθηκε στο `run_experiment.sh`.
- **Σε 2 runs αποφάσισε και το εφεδρικό μοντέλο.** Ο κανόνας μας, που τον ορίσαμε πριν δούμε τον τρίτο γύρο: ένα
  επιπλέον run μόνο με το κύριο μοντέλο για κάθε τέτοιο run. Τα runs με το εφεδρικό **μένουν** και αναφέρονται χωριστά·
  δεν πετάμε αποτελέσματα που δεν μας αρέσουν.

### 9.6 Ένα μόνο run με το χέρι
```bash
SCENARIO=stuck AIOPS_MEMORY=off ./4-load-testing/run_experiment.sh llm δοκιμή   # σενάρια: baseline|stuck|cpuhog|badconfig
RULES_RESTART=on SCENARIO=badconfig ./4-load-testing/run_experiment.sh rules      # rules-v2
SCENARIO=cpuhog ./4-load-testing/run_experiment.sh hpa                            # ή rules, static-1, static-3
```
Το δεύτερο όρισμα μπαίνει στη στήλη `notes`. Η ετικέτα (`LABEL=`) είναι by default `llm-v8.1` ή το όνομα της μεθόδου.

### 9.7 Παγίδες που μάθαμε
- **Ποτέ δύο στρατηγικές μαζί.** Κλιμακώνουν το ίδιο deployment.
- **`pgrep -f full_campaign.sh` βρίσκει και τον εαυτό του.** Αν φτιάξεις δικό σου βρόχο αναμονής, μετά βρίσκει και κάθε
  shell που έχει αυτό το όνομα στη γραμμή εντολών του, οπότε ο βρόχος δεν τελειώνει ποτέ. Περίμενε με βάση το PID:
  `while kill -0 <pid>; do sleep 60; done`.
- **Αν αλλάξεις ένα script ενώ τρέχει,** γράψε το νέο σε άλλο αρχείο και κάνε `mv`. Το bash διαβάζει τα scripts κομμάτι
  κομμάτι, και μια επεξεργασία στη θέση τους μπορεί να σπάσει το αντίγραφο που τρέχει. Το `full_campaign.sh` είναι
  προστατευμένο: όλο του το σώμα είναι ένα μπλοκ `{ … }`.
- **Το Gemini έχει ώρες με συνεχή 503.** Η καμπάνια το χειρίζεται μόνη της. Αν κάποιο run χρησιμοποίησε εφεδρικό μοντέλο,
  δες την 9.5.
