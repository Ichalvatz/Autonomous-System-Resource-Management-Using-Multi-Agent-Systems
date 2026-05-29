import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib

print("📊 1. Παραγωγή Τεράστιου Συνθετικού Ιστορικού...")
np.random.seed(42)

# Κατηγορία 1: Φυσιολογική, ήσυχη λειτουργία (500 εγγραφές)
low_load = pd.DataFrame({
    'cpu_usage': np.random.normal(30, 5, 500),      
    'memory_usage': np.random.normal(40, 5, 500),   
    'latency_ms': np.random.normal(100, 20, 500)    
})

# Κατηγορία 2: Αυξημένη κίνηση, αλλά ΟΚ (200 εγγραφές)
# Αυτό το βάζουμε για να ΜΗΝ χτυπάει Alert στο 55-60% CPU!
medium_load = pd.DataFrame({
    'cpu_usage': np.random.normal(55, 5, 200),
    'memory_usage': np.random.normal(60, 5, 200),
    'latency_ms': np.random.normal(250, 30, 200)
})

# Κατηγορία 3: Πραγματικές Ανωμαλίες / Crashes (20 εγγραφές)
anomalies = pd.DataFrame({
    'cpu_usage': np.random.uniform(85, 100, 20),    
    'memory_usage': np.random.uniform(85, 100, 20), 
    'latency_ms': np.random.uniform(2000, 5000, 20) 
})

# Ένωση όλων των δεδομένων σε ένα μεγάλο Dataset και ανακάτεμα (shuffle)
train_df = pd.concat([low_load, medium_load, anomalies]).sample(frac=1).reset_index(drop=True)

# Αποθήκευση στο CSV για να έχεις το αρχείο σου!
train_df.to_csv('training_metrics.csv', index=False)
print(f"💾 Τα δεδομένα αποθηκεύτηκαν στο 'training_metrics.csv' ({len(train_df)} εγγραφές συνολικά).")

# ==========================================
# 2. Εκπαίδευση του Μοντέλου
# ==========================================
print("\n🌲 2. Εκπαίδευση του Isolation Forest...")
# contamination = 20 ανωμαλίες / 720 συνολικές εγγραφές (περίπου 0.027 ή 2.7%)
model = IsolationForest(n_estimators=100, contamination=0.027, random_state=42)
model.fit(train_df)

# ==========================================
# 3. Αποθήκευση Μοντέλου
# ==========================================
joblib.dump(model, 'aiops_anomaly_model.pkl')
print("✅ 3. Το AI μοντέλο εκπαιδεύτηκε επιτυχώς και αποθηκεύτηκε στο 'aiops_anomaly_model.pkl'!")