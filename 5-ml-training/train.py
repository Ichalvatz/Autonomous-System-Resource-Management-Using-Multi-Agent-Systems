import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

# Φόρτωση του CSV που μόλις αποθήκευσες
df = pd.read_csv("baseline_metrics_sample.csv").set_index("timestamp")

# Κρατάμε μόνο τις πρώτες 52 υγιείς γραμμές (αφαιρούμε το κρασάρισμα του τέλους)
df_clean = df.iloc[:52]

ML_FEATURES = [
    "avg_cpu_per_pod",
    "latency_p95",
    "cpu_throttling",
    "throughput",
    "active_replicas",
]
df_train = df_clean[ML_FEATURES]

print(f" Εκπαίδευση με {len(df_train)} καθαρά, πολυδιάστατα δείγματα!")

# Training Scale-Aware Isolation Forest
model = IsolationForest(n_estimators=200, contamination=0.03, random_state=42)
model.fit(df_train)

# Αποθήκευση
joblib.dump(model, "isolation_forest_baseline.pkl")
print(" Το Scale-Aware μοντέλο είναι έτοιμο και πανίσχυρο!")