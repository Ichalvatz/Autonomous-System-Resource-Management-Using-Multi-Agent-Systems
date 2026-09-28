import time
import requests
import pandas as pd
from datetime import datetime

# Configuration
PROMETHEUS_URL = "http://prometheus.aiops"
INTERVAL_SECONDS = 5
CSV_FILENAME = "stress_test_results.csv"

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
        results = data.get('data', {}).get('result', [])
        if results and len(results) > 0:
            value = float(results[0]['value'][1])
            return 0.0 if pd.isna(value) else value
        return 0.0
    except Exception as e:
        return 0.0

def run_profiler():
    print("🚀 [Stress Profiler] Started. Waiting for load...")
    history_data = []
    breaking_point_reached = False

    try:
        while True:
            timestamp = datetime.now().strftime("%H:%M:%S")
            current_metrics = {'timestamp': timestamp}

            for name, query in QUERIES.items():
                current_metrics[name] = fetch_metric(name, query)

            tput = round(current_metrics["throughput"], 2)
            lat = round(current_metrics["latency_p95"], 3)
            cpu = round(current_metrics["avg_cpu_per_pod"], 3)

            throttle_ratio = current_metrics["cpu_throttling"]
            throttle_pct = round(throttle_ratio * 100, 2)

            history_data.append(current_metrics)

            print(f"[{timestamp}] Tput: {tput} RPS | Latency P95: {lat}s | CPU: {cpu} cores | Throttling: {throttle_pct}%")

            # AUTOMATED BREAKING POINT DETECTION (resource-driven)
            if tput > 5 and not breaking_point_reached:
                if cpu >= 0.95 or throttle_pct > 15.0:
                    print(f"\n🔥 [BREAKING POINT] CPU Saturation! Pod hit the limit (CPU: {cpu} cores / Throttling: {throttle_pct}%).\n")
                    breaking_point_reached = True
                elif lat > 1.000:
                    print(f"\n❌ [BREAKING POINT] Soft Limit reached! Latency: {lat}s at {tput} RPS\n")
                    breaking_point_reached = True

            time.sleep(INTERVAL_SECONDS)

    except KeyboardInterrupt:
        print("\n⏹️ Profiling stopped by user. Saving data...")
    finally:
        if history_data:
            df = pd.DataFrame(history_data).set_index('timestamp')
            df.to_csv(CSV_FILENAME)
            print(f"📄 Full stress test data saved to {CSV_FILENAME}.")

if __name__ == "__main__":
    run_profiler()