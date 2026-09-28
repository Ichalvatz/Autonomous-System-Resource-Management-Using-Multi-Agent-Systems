import os
import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

# Φόρτωση του CSV με τα 240 δείγματα της 1 ώρας
csv_path = "baseline_metrics_sample_continuous.csv"
if not os.path.exists(csv_path):
    # Εναλλακτικό όνομα αν σώθηκε με το default
    csv_path = "baseline_metrics_sample.csv"

print(f"📂 Φόρτωση δεδομένων από: {csv_path}")
df = pd.read_csv(csv_path).set_index("timestamp")

ML_FEATURES = ["avg_cpu_per_pod", "latency_p95", "cpu_throttling", "throughput", "active_replicas"]
df_train = df[ML_FEATURES]

print(f"📊 Σύνολο δειγμάτων: {len(df_train)} (60 λεπτά καταγραφής)")

# Εκπαίδευση του Scale-Aware Isolation Forest
model = IsolationForest(n_estimators=200, contamination=0.03, random_state=42)
model.fit(df_train)

# Αποθήκευση στο σωστό absolute path
output_filename = "isolation_forest_baseline.pkl"
joblib.dump(model, output_filename)

print(f"💾 ΤΕΛΟΣ! Το μοντέλο εκπαιδεύτηκε επιτυχώς και αποθηκεύτηκε στο: {output_filename}")