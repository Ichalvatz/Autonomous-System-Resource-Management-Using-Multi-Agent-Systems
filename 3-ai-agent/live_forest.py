import pandas as pd
import joblib

# 1. Φόρτωση του έτοιμου, εκπαιδευμένου μοντέλου
print("🧠 Φόρτωση του AI Μοντέλου από τον δίσκο...")
try:
    model = joblib.load('aiops_anomaly_model.pkl')
except FileNotFoundError:
    print("❌ Δεν βρέθηκε το μοντέλο. Τρέξε πρώτα το train_model.py!")
    exit()

def analyze_live_metrics(cpu, mem, latency):
    """Δέχεται live μετρικές και βγάζει ακαριαία απόφαση"""
    live_df = pd.DataFrame({'cpu_usage': [cpu], 'memory_usage': [mem], 'latency_ms': [latency]})
    
    # Πρόβλεψη: 1 = Normal, -1 = Anomaly
    prediction = model.predict(live_df)[0]
    
    if prediction == -1:
        print(f"🚨 ALERT! Ανιχνεύτηκε Ανωμαλία (CPU:{cpu}%, Mem:{mem}%, Lat:{latency}ms)")
        return True
    else:
        print(f"✅ NORMAL (CPU:{cpu}%, Mem:{mem}%, Lat:{latency}ms)")
        return False

print("\n--- LIVE MONITORING STARTED ---")
# Τώρα η αυξημένη κίνηση ΔΕΝ θα χτυπήσει Alert!
analyze_live_metrics(10, 10, 300) 

# Το Load Test Crash ΘΑ χτυπήσει!
analyze_live_metrics(99, 99,100)