# Ημερολόγιο εργασίας, φάση 2 (σχεδιασμός με βάση τις NFR, agent v9)

Πλάνο και αποφάσεις: `design_decisions.md` Α24. Εδώ γράφεται με τη σειρά ό,τι γίνεται: τι άλλαξε, τι μετρήθηκε, τι
πήγε στραβά και πώς διορθώθηκε. Ο χρήστης ζήτησε (22/10) να γίνουν όλα χωρίς αναφορές ή ερωτήσεις ενδιάμεσα· τα βασικά
αποτελέσματα κάθε φάσης περνούν μετά στις ενότητες Α25+ του `design_decisions.md`.

## 2026-10-22
- 23:15 Σημείο ελέγχου: branch `nfr-v9`, commit `1794a69`, tag `v8.1-campaign`. Ακυρώθηκε η ουρά με τα 2 πρόσθετα runs του v8.1.
- 23:16 Α24 γραμμένη (αποφάσεις). Ξεκινά η Φάση 1 (εφαρμογή και υποδομή).
- 23:26 **Φάση 1 (εφαρμογή και υποδομή) έτοιμη.**
  - Backend:
    - νέο σύνολο δεδομένων για load tests (`config/seedData/generated.js`, ενεργό μόνο με `SEED_DATASET=load`): 5015 τόποι, 50206 reviews, 1002 χρήστες, φόρτωση 0.28 s, 25 MB heap·
    - ευρετήρια στο in-memory DB (`config/inMemoryDb/indexes.js`): πριν, κάθε ανάγνωση τόπου ή review σάρωνε όλα τα reviews·
    - σελιδοποίηση στο search (20 ανά σελίδα, μέγιστο 50)·
    - stuck → 503 `DB_POOL_EXHAUSTED` μετά τα 3 s· νέο `/ready`·
    - buckets 0.35, 3 και 10 στο histogram·
    - αφαιρέθηκε το `FEATURE_LOGIN_AUDIT` (badconfig).
  - Jest: 812/812 (802 + 10 νέα: σύνολο δεδομένων, ευρετήρια, `/ready`, σελιδοποίηση, stuck 503, ρηχό `/health`).
  - Κόστος ανά endpoint, μόνο η λογική της βάσης, στο Mac:
    - search 1.0 ms·
    - λεπτομέρειες τόπου / reviews ~0.005 ms·
    - recommendations ~0.6 ms·
    - login ~65 ms (bcrypt).

    Με τη μίξη, το login είναι ~88% της CPU: ~7 ms CPU ανά αίτημα, δηλαδή ~100 rps ανά pod. Αν βγει έτσι και στο cluster, το k6 το βγάζει.
  - Υποδομή:
    - ingress-nginx καρφωμένο στο `controller-v1.15.1`, με `--enable-metrics=true` (στην 1.15.1 το default είναι false) και `--time-buckets` ίδια με του backend·
    - `1-infrastructure/ingress-metrics.yaml` (Service + ServiceMonitor): ο στόχος είναι `up` στο Prometheus, με labels `host`, `status`, `method`, `path="/"`·
    - probes στο backend (readiness `/ready` 5 s / 2 s / ×3, liveness `/health` 10 s / 5 s / ×3)·
    - ChromaDB καρφωμένο στο digest που έτρεχε (server 1.0.0), με τον όγκο στο `/data`. Ελέγχθηκε: ένα collection επιβιώνει σε restart.
  - Αντίγραφο της μνήμης της φάσης 1 (13 περιστατικά): `4-load-testing/archive/memory_snapshots/chroma_snapshot_2026-10-22_end_of_phase1.json`.
