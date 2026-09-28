import time
import json
import joblib
import requests
import pandas as pd
from datetime import datetime

# Import the agent function from the corresponding file
from agent import trigger_ai_agent

PROMETHEUS_URL = "http://prometheus.aiops"
INTERVAL_SECONDS = 10
MODEL_FILENAME = "./5-ml-training/isolation_forest_baseline.pkl"
ML_FEATURES = ["avg_cpu_per_pod", "latency_p95", "cpu_throttling", "throughput", "active_replicas"]
# The anomaly detector is context-aware: all five operational metrics are used
# both for Isolation Forest scoring and for the agent's diagnosis context.
QUERIES = {
    "avg_cpu_per_pod": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / scalar(kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"})',
    "throughput": 'sum(rate(http_requests_total{app="aiops-backend"}[1m]))',
    "latency_p95": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))',
    "active_replicas": 'kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"}',
    "cpu_throttling": 'sum(increase(container_cpu_cfs_throttled_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / sum(increase(container_cpu_cfs_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))'
}

def fetch_metric(query_name, query_string):
    try:
        response = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={'query': query_string}, timeout=5)
        response.raise_for_status()
        data = response.json()
        if data.get('status') != 'success':
            print(f"Metric unavailable: {query_name} (Prometheus status was not success)")
            return None

        results = data.get('data', {}).get('result', [])
        if results and len(results) > 0:
            value = float(results[0]['value'][1])
            if pd.isna(value):
                print(f"Metric unavailable: {query_name} returned NaN")
                return None
            return value

        print(f"Metric unavailable: {query_name} returned no result")
        return None
    except Exception as e:
        print(f"Metric unavailable: {query_name}: {e}")
        return None

def run_monitor():
    print(f"Loading anomaly detection model from: {MODEL_FILENAME}")
    try:
        model = joblib.load(MODEL_FILENAME)
    except FileNotFoundError:
        print("Error: The model file was not found. Run the training script first.")
        return

    print("✅ Model loaded. Starting continuous monitoring...")

    while True:
        current_metrics = {}
        for name, query in QUERIES.items():
            current_metrics[name] = fetch_metric(name, query)

        missing_metrics = [
            name for name, value in current_metrics.items() if value is None
        ]
        if missing_metrics:
            print(
                f"Metrics unavailable: {missing_metrics}. "
                "Skipping ML prediction and remediation."
            )
            time.sleep(INTERVAL_SECONDS)
            continue

        df = pd.DataFrame([current_metrics])

        # ML evaluates the complete context-aware five-metric snapshot.
        # Preserve the exact training order from the fitted model; sklearn is strict about column order.
        model_feature_order = list(getattr(model, "feature_names_in_", ML_FEATURES))
        missing_ml_features = [feature for feature in model_feature_order if feature not in df.columns]
        if missing_ml_features:
            print(f"Error: missing ML feature(s): {missing_ml_features}")
            time.sleep(INTERVAL_SECONDS)
            continue
        df_ml = df[model_feature_order]

        cpu = float(current_metrics.get("avg_cpu_per_pod", 0.0) or 0.0)
        throttling = float(current_metrics.get("cpu_throttling", 0.0) or 0.0)
        replicas = float(current_metrics.get("active_replicas", 0.0) or 0.0)
        latency = float(current_metrics.get("latency_p95", 0.0) or 0.0)
        throughput = float(current_metrics.get("throughput", 0.0) or 0.0)

        # Data quality gate: below ~1 rps there isn't enough traffic signal
        # for a meaningful health evaluation (same logic as the NaN skip).
        # The model was trained on throughput ≥ 1.8 rps.
        if throughput < 1.8:
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] "
                f"Low traffic ({throughput:.2f} rps) — skipping prediction."
            )
            time.sleep(INTERVAL_SECONDS)
            continue

        # The scale-aware model handles all anomaly types, including waste
        # (many replicas + zero traffic), because it was never trained on
        # those combinations — they fall outside the learned healthy boundary.
        prediction = model.predict(df_ml)[0]

        print(
            f"cpu: {cpu:.3f}, throttling: {throttling:.3f}, "
            f"latency: {latency:.3f}, throughput: {throughput:.3f}, "
            f"replicas: {replicas:.0f}, prediction: {prediction}"
        )

        timestamp = datetime.now().strftime("%H:%M:%S")

        if prediction == -1:
            print(f"\n[{timestamp}] ANOMALY DETECTED!")
            # Για καλύτερη απεικόνιση τυπώνουμε το Throttling ως ποσοστό
            print(f"Metrics: Tput: {current_metrics['throughput']:.1f} | CPU: {current_metrics['avg_cpu_per_pod']:.2f} | Throttling: {current_metrics['cpu_throttling']*100:.1f}% | Latency: {current_metrics['latency_p95']:.3f}s")

            metrics_json = json.dumps(current_metrics)
            
            print("Αναμονή ολοκλήρωσης ενεργειών από τον Agent...")
            is_resolved = trigger_ai_agent(metrics_json)

            
            if is_resolved:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}]  Το πρόβλημα επιλύθηκε από τον Agent. Επανεκκίνηση παρακολούθησης.")
            else:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Ο Agent δεν επιβεβαίωσε επίλυση. Επανεκκίνηση παρακολούθησης.")
            
            print("Εφαρμογή Cooldown 60 δευτερολέπτων...")
            time.sleep(60)
        else:
            print(f"[{timestamp}]  Normal operation.")
            time.sleep(INTERVAL_SECONDS)

        
if __name__ == "__main__":
    run_monitor()