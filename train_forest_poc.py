import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

# ==========================================
# 1. Παραγωγή Δικών μας Δεδομένων (Training Data)
# ==========================================
print("📊 Δημιουργία συνθετικού ιστορικού μετρικών...")
np.random.seed(42)

# Φυσιολογική λειτουργία (π.χ. 500 στιγμιότυπα όπου ο server είναι χαλαρός)
normal_data = pd.DataFrame({
    'cpu_usage': np.random.normal(30, 5, 500),      # CPU γύρω στο 30%
    'memory_usage': np.random.normal(40, 5, 500),   # Μνήμη γύρω στο 40%
    'latency_ms': np.random.normal(100, 20, 500)    # Latency γύρω στα 100ms
})

# Βλάβες / Anomalies (π.χ. 20 στιγμιότυπα με ακραίο φόρτο)
anomalous_data = pd.DataFrame({
    'cpu_usage': np.random.uniform(85, 100, 20),    # CPU 85-100%
    'memory_usage': np.random.uniform(85, 100, 20), # Μνήμη 85-100%
    'latency_ms': np.random.uniform(2000, 5000, 20) # Latency στο Θεό
})

# Ενώνουμε τα δεδομένα για να φτιάξουμε το τελικό Dataset
train_df = pd.concat([normal_data, anomalous_data])

# ==========================================
# 2. Εκπαίδευση του Isolation Forest
# ==========================================
print("🌲 Φύτευση του Isolation Forest...")
# contamination = 0.05 σημαίνει ότι περιμένουμε ~5% του Dataset να είναι ανωμαλίες
model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)

# Το μοντέλο "μαθαίνει" πώς μοιάζει το cluster
model.fit(train_df)
print("✅ Το μοντέλο εκπαιδεύτηκε επιτυχώς!\n")

# ==========================================
# 3. Live Testing (Η Ώρα της Αλήθειας)
# ==========================================
def check_alert(cpu, mem, latency, description):
    """Παίρνει live μετρικές και ελέγχει αν πρέπει να χτυπήσει Alert"""
    live_df = pd.DataFrame({'cpu_usage': [cpu], 'memory_usage': [mem], 'latency_ms': [latency]})
    
    # Το μοντέλο επιστρέφει: 1 για Φυσιολογικό, -1 για Ανωμαλία
    prediction = model.predict(live_df)[0]
    
    print(f"👉 Σενάριο: {description}")
    if prediction == -1:
        print(f"   🚨 ALERT (ΑΝΩΜΑΛΙΑ)! CPU: {cpu}%, Mem: {mem}%, Lat: {latency}ms")
    else:
        print(f"   ✅ NORMAL (ΟΚ). CPU: {cpu}%, Mem: {mem}%, Lat: {latency}ms")
    print("-" * 50)

print("--- ΕΝΑΡΞΗ ΠΡΟΣΟΜΟΙΩΣΗΣ ΜΕΤΡΙΚΩΝ ---")

# Τεστ 1: Μια ήσυχη Τρίτη πρωί
check_alert(cpu=28, mem=42, latency=95, description="Ήσυχη μέρα, ελάχιστο traffic.")

# Τεστ 2: Λίγος φόρτος παραπάνω (ΔΕΝ πρέπει να χτυπήσει alert)
check_alert(cpu=50, mem=60, latency=250, description="Αυξημένη κίνηση, αλλά διαχειρίσιμη.")

# Τεστ 3: Απότομο Spike στη CPU
check_alert(cpu=98, mem=45, latency=110, description="Άπειροι υπολογισμοί ξαφνικά (CPU Spike).")

# Τεστ 4: Το K6 Crash (Πλήρης κατάρρευση)
check_alert(cpu=99, mem=99, latency=4500, description="K6 Load Test Crash (Deadlock).")