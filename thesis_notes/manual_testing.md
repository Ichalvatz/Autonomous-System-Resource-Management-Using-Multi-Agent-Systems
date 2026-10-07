# Οδηγός χειροκίνητων δοκιμών

Πώς τρέχεις και ελέγχεις μόνος σου κάθε σενάριο, βήμα-βήμα. Όλες οι εντολές από τη ρίζα του repo
(`~/Documents/LLM_AGENT`), σε macOS / zsh. Χρειάζεσαι **3 τερματικά**: (1) agent, (2) φορτίο k6, (3) εντολές/παρατήρηση.

> **Σημαντικό:** όσο τρέχουν οι αυτόματες ουρές πειραμάτων (`pgrep -fl "queue|run_experiment"`), **μην** κάνεις
> χειροκίνητες δοκιμές: δύο controllers στο ίδιο deployment «μάχονται» και χαλάνε και τα δύο.

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
.venv/bin/python3 -m pytest 3-ai-agent/tests -q        # 68 passed
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
python 3-ai-agent/anomaly_detector.py        # η τελική έκδοση (v8, default)
# χωρίς LLM, μόνο ο ανιχνευτής (δεν αγγίζει το cluster):
python 3-ai-agent/anomaly_detector.py --dry-run
```
Κάθε 10 s τυπώνει μια γραμμή `cpu: …, latency: …, prediction: 1 (score …)`. `prediction: -1` = ανώμαλη μέτρηση· 3 στη σειρά
→ `ANOMALY DETECTED!` → ξυπνά ο agent και βλέπεις **όλα** τα βήματά του (τι κώδικα έγραψε, τι είδε, τι έκανε), μετά
`Verifying...` και `STABLE`/`UNSTABLE`.

**Εφεδρικό μοντέλο:** από 4/10 είναι default το `gemini/gemini-2.5-flash` (ίδιο κλειδί): αν το κύριο μοντέλο αποτύχει
4 φορές (503 «high demand», κενές απαντήσεις), ο agent συνεχίζει με αυτό. `AIOPS_FALLBACK_MODEL=off` για να το κλείσεις
(έτσι έτρεξαν όλα τα μετρημένα runs).
(Ελέγχθηκε 2026-10-03: απαντά σε ~0.6 s. Το `gemini-2.5-flash-lite` έχει αποσυρθεί, το pro δίνει 429 στο δωρεάν tier.)

Επιλογές: `AIOPS_MEMORY=off` (χωρίς μνήμη), `AIOPS_ACT_GUARD=off` (χωρίς τους φραγμούς: και τους τρεις στο v8),
`AIOPS_PROMPT=v4|v5|v6|v7` (παλιές εκδόσεις, για σύγκριση).

**Τι να παρακολουθείς (τερματικό 3):**
```bash
kubectl get pods -l app=aiops-backend -w                       # pods που έρχονται/φεύγουν
kubectl get deploy aiops-backend-deployment -w                 # replicas
tail -f 3-ai-agent/incident_log.csv                            # κάθε περιστατικό: ενέργειες, ετυμηγορία, χρόνοι
python 4-load-testing/analyze_agent_steps.py llm v8            # (μετά) βήμα-βήμα ανάλυση των περιστατικών των runs
```
Και στο browser: `http://grafana.aiops` ή `http://prometheus.aiops/graph` με π.χ.
`histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))`.

---

## 2. Σενάριο: κανονικό φορτίο (κλιμάκωση πάνω και κάτω)

```bash
k6 run 4-load-testing/baseline_eval.js     # 38 λεπτά, το μετρημένο σενάριο
k6 run 4-load-testing/baseline.js          # 22 λεπτά, η δική σου πιο γρήγορη εκδοχή
```
**Τι πρέπει να δεις (baseline_eval.js):**
| Λεπτό | Φορτίο | Αναμενόμενο |
|---|---|---|
| 0–5 | 5 χρήστες | καμία ενέργεια (1 pod) |
| ~6–9 | 20 χρήστες | αφύπνιση → «CAPACITY» → `scale 1->2` → STABLE |
| ~14–17 | 30 χρήστες | `scale 2->3` → STABLE |
| ~22–26 | 14 χρήστες | σπατάλη → `scale 3->2` |
| ~30–34 | 5 χρήστες | `scale 2->1` |
Ο agent (v8) σε αυτά συνήθως **δεν** χρειάζεται tools παρατήρησης (τα υπολογισμένα γεγονότα λένε «CPU ανά αίτημα ≈ 1×»).
Χρήστες: p95 < 0.35 s σχεδόν όλη την ώρα.

---

## 3. Σενάριο: κολλημένη εξάρτηση (stuck)

```bash
# τερματικό 2: σταθερό φορτίο 8 χρηστών
k6 run 4-load-testing/fault_load.js
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
k6 run 4-load-testing/fault_load.js        # τερματικό 2
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
k6 run 4-load-testing/fault_load.js        # τερματικό 2
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
