import time
import requests
import pandas as pd
from sklearn.ensemble import IsolationForest
from datetime import datetime
import json
import threading
from aiops_agent import trigger_ai_agent

# Ρυθμίσεις
PROMETHEUS_URL = "http://prometheus.aiops"
INTERVAL_SECONDS = 15
WARMUP_PERIOD = 5  # 20 δείγματα = 5 λεπτά ησυχίας

# Διορθωμένα Queries (Ψάχνουν το Pod prefix αντί για ακριβές container name)
QUERIES = {
    "cpu_usage": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))',
    "memory_usage": 'sum(container_memory_working_set_bytes{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""})',
    "throughput": 'sum(rate(http_requests_total{namespace="default"}[1m]))',
    "latency_p95": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{namespace="default"}[1m])) by (le))',
    "error_rate": 'sum(rate(http_requests_total{namespace="default", status=~"5.."}[1m])) / sum(rate(http_requests_total{namespace="default"}[1m]))',
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
        return 0.0

def main():
    print(f"🚀 [AIOps] Ξεκινάει η παρακολούθηση...")
    print(f"⏳ WARMUP: Παρακαλώ ΜΗΝ τρέξετε το Load Test για τα επόμενα {WARMUP_PERIOD * INTERVAL_SECONDS} δευτερόλεπτα!\n")
    
    history_data = []
    # contamination=0.05 σημαίνει ότι είμαστε πιο αυστηροί. Μόνο το 5% των καθαρών δεδομένων θεωρείται θόρυβος.
    model = IsolationForest(contamination=0.05, random_state=42)
    is_trained = False

    while True:
        timestamp = datetime.now().strftime("%H:%M:%S")
        current_metrics = {'timestamp': timestamp}
        
        for name, query in QUERIES.items():
            current_metrics[name] = fetch_metric(name, query)
            
        history_data.append(current_metrics)
        df = pd.DataFrame(history_data).set_index('timestamp')
        
        metrics_str = " | ".join([f"{k}: {v:.4f}" for k, v in current_metrics.items() if k != 'timestamp'])
        
        # 1. Φάση Warmup (Συλλογή "Καθαρών" Δεδομένων)
        if len(df) < WARMUP_PERIOD:
            print(f"[{timestamp}] 🟡 WARMUP ({len(df)}/{WARMUP_PERIOD}) -> {metrics_str}")
        
        # 2. Η στιγμή του Freeze (Εκπαίδευση ΜΟΝΟ μια φορά)
        elif not is_trained:
            print(f"[{timestamp}] 🔒 FREEZE: Εκπαίδευση μοντέλου στα καθαρά δεδομένα. Το Baseline κλείδωσε!")
            model.fit(df)
            is_trained = True
            
        # 3. Φάση Inference (Πρόβλεψη χωρίς νέα εκπαίδευση)
        else:
            latest_data = df.iloc[-1:]
            prediction = model.predict(latest_data)[0] 
            
            if prediction == -1:
                print(f"[{timestamp}] 🔴 ANOMALY DETECTED! 🔴 -> {metrics_str}")
                metrics_json = json.dumps(current_metrics)
                
                # Εκτέλεση του Agent σε ξεχωριστό thread. 
                # Ο Agent χρειάζεται 5-10 δευτερόλεπτα να απαντήσει. Αν τρέξει στο κύριο thread, 
                # θα καθυστερήσει το loop των 15 δευτερολέπτων και θα χαθούν δείγματα από το Prometheus.
                agent_thread = threading.Thread(target=trigger_ai_agent, args=(metrics_json,))
                agent_thread.start()
            else:
                print(f"[{timestamp}] 🟢 NORMAL -> {metrics_str}")

        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    main()

# 