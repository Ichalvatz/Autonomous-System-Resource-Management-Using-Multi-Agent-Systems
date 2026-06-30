import time
import requests
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
from datetime import datetime

# Ρυθμίσεις
PROMETHEUS_URL = "http://prometheus.aiops"
INTERVAL_SECONDS = 15
TRAIN_SAMPLES = 20  # 20 δείγματα * 15 δευτερόλεπτα = 5 λεπτά συλλογής δεδομένων
MODEL_FILENAME = "isolation_forest_baseline.pkl"

QUERIES = {
    "cpu_usage": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))',
    "memory_usage": 'sum(container_memory_working_set_bytes{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""})',
    "throughput": 'sum(rate(http_requests_total{app="aiops-backend"}[1m]))',
    "latency_p95": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))',
    "error_rate": 'sum(rate(http_requests_total{app="aiops-backend", status_code=~"5.."}[1m])) / sum(rate(http_requests_total{app="aiops-backend"}[1m]))',
    "active_replicas": 'kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"}'
}

def fetch_metric(query_name, query_string):
    try:
        response = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={'query': query_string}, timeout=5)
        response.raise_for_status()
        data = response.json()
        results = data.get('data', {}).get('result', [])
        if results and len(results) > 0:
            value = float(results[0]['value'][1])
            return 0.0 if pd.isna(value) else value
        return 0.0 
    except Exception as e:
        print(f"Σφάλμα λήψης {query_name}: {e}")
        return 0.0

def main():
    print("🚀 [AIOps Trainer] Έναρξη συλλογής δεδομένων για το Baseline (Κανονικότητα).")
    print(f"⚠️ Βεβαιωθείτε ότι τρέχουν ακριβώς 2 Pods και η κίνηση είναι σε φυσιολογικά επίπεδα.")
    
    # Έλεγχος αρχικού state
    initial_replicas = fetch_metric("active_replicas", QUERIES["active_replicas"])
    if initial_replicas != 2.0:
        print(f"❌ Σφάλμα: Εντοπίστηκαν {initial_replicas} replicas. Απαιτούνται ακριβώς 2 για την εκπαίδευση.")
        return

    history_data = []

    # Φάση Συλλογής (Warmup)
    for i in range(TRAIN_SAMPLES):
        timestamp = datetime.now().strftime("%H:%M:%S")
        current_metrics = {'timestamp': timestamp}
        
        for name, query in QUERIES.items():
            current_metrics[name] = fetch_metric(name, query)
            
        history_data.append(current_metrics)
        metrics_str = " | ".join([f"{k}: {v:.4f}" for k, v in current_metrics.items() if k != 'timestamp'])
        
        print(f"[{timestamp}] Συλλογή ({i+1}/{TRAIN_SAMPLES}) -> {metrics_str}")
        time.sleep(INTERVAL_SECONDS)

    # Προετοιμασία Δεδομένων
    df = pd.DataFrame(history_data).set_index('timestamp')
    print("\n✅ Η συλλογή ολοκληρώθηκε. Εκκίνηση εκπαίδευσης Isolation Forest...")

    # Εκπαίδευση Μοντέλου
    # contamination=0.05 σημαίνει 5% ανοχή στο θόρυβο
    model = IsolationForest(contamination=0.05, random_state=42)
    model.fit(df)

    # Αποθήκευση στο δίσκο
    joblib.dump(model, MODEL_FILENAME)
    print(f"💾 Το μοντέλο εκπαιδεύτηκε επιτυχώς και αποθηκεύτηκε στο αρχείο: {MODEL_FILENAME}")
    
    # Αποθήκευση και ενός δείγματος δεδομένων για αναφορά
    df.to_csv("baseline_metrics_sample.csv")
    print("📄 Δείγμα των μετρικών κανονικότητας αποθηκεύτηκε στο baseline_metrics_sample.csv")

if __name__ == "__main__":
    main()