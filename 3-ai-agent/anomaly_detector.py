import argparse
import csv
import os
import signal
import time
import json
import joblib
import requests
import pandas as pd
from datetime import datetime

PROMETHEUS_URL = "http://prometheus.aiops"
INTERVAL_SECONDS = 10
MODEL_FILENAME = "./5-ml-training/health_model.pkl"
DRY_RUN_CSV = "./5-ml-training/dry_run_readings.csv"
# Below this there isn't enough traffic for a meaningful evaluation.
# Must stay below the 1-VU training data (~0.9 rps) collected by collect_healthy_data.py.
MIN_THROUGHPUT_RPS = 0.8
# Consecutive anomalous readings required before waking the agent (3 x 10s = 30s).
# The model flags some healthy readings (~7% in simulation), so single readings are noise.
ANOMALY_STREAK_REQUIRED = 3
# The PromQL rate() windows are 1m, so after a replica change the metrics mix old
# and new pod counts. The training data has no such readings (the collector waits
# 60s after each replica change), so we skip them too.
REPLICA_SETTLE_SECONDS = 90
# Minimum time between two agent runs. Monitoring continues meanwhile.
AGENT_COOLDOWN_SECONDS = 60
ML_FEATURES = ["avg_cpu_per_pod", "latency_p95", "cpu_throttling", "throughput", "active_replicas"]
# All five metrics go to the agent. The model uses four of them: there is one
# One-Class SVM per replica count (trained by train_health_baseline.py), and
# active_replicas selects which one scores the reading.
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

def print_summary(stats, started_at, dry_run):
    minutes = (time.monotonic() - started_at) / 60
    evaluated = stats["evaluated"]
    anomaly_pct = stats["anomalous"] / evaluated * 100 if evaluated else 0.0
    per_hour = f" ({stats['triggers'] / minutes * 60:.1f}/hour)" if minutes > 0 else ""
    label = "Would have woken the agent" if dry_run else "Woke the agent"

    print(f"\n--- Monitor summary ({minutes:.1f} min{', DRY RUN' if dry_run else ''}) ---")
    print(f"  Readings evaluated:          {evaluated}")
    print(f"  Anomalous readings:          {stats['anomalous']} ({anomaly_pct:.1f}%)")
    print(f"  {label + ':':<29}{stats['triggers']}{per_hour}")
    print(
        f"  Skipped readings:            settling={stats['skipped_settling']} "
        f"low_traffic={stats['skipped_low_traffic']} "
        f"missing_metrics={stats['skipped_missing']}"
    )
    if dry_run:
        print(f"  Per-reading log:             {DRY_RUN_CSV}")

def load_models():
    """Load the per-replica bundle saved by train_health_baseline.py:
    {"model_type": ..., "features": [...], "models": {replicas: model}}."""
    try:
        bundle = joblib.load(MODEL_FILENAME)
    except FileNotFoundError:
        print("Error: The model file was not found. Run 5-ml-training/train_health_baseline.py first.")
        return None
    if not isinstance(bundle, dict) or not {"features", "models"} <= bundle.keys():
        print(f"Error: {MODEL_FILENAME} is not a per-replica model bundle. Retrain with train_health_baseline.py.")
        return None
    return bundle


def evaluate(bundle, metrics):
    """Return (prediction, score) for one reading: -1 = anomaly, 1 = normal.
    A replica count with no trained model has no known healthy band, so it
    counts as an anomaly (score None)."""
    model = bundle["models"].get(int(round(metrics["active_replicas"])))
    if model is None:
        return -1, None
    # Column names must match training; the pipeline selects columns by name.
    x = pd.DataFrame([metrics])[bundle["features"]]
    return int(model.predict(x)[0]), float(model.decision_function(x)[0])


def run_monitor(dry_run=False):
    print(f"Loading anomaly detection model from: {MODEL_FILENAME}")
    bundle = load_models()
    if bundle is None:
        return
    print(
        f"Model: {bundle.get('model_type', '?')} per replica count "
        f"{sorted(bundle['models'])}, features {bundle['features']}"
    )

    if dry_run:
        # No agent import: dry runs need no LLM key and never touch the cluster.
        print("🧪 DRY RUN: anomalies are counted and logged, the agent is never called.")
        # Never overwrite an earlier run's evidence: move it aside with its timestamp.
        if os.path.exists(DRY_RUN_CSV):
            stamp = datetime.fromtimestamp(os.path.getmtime(DRY_RUN_CSV)).strftime("%Y%m%d_%H%M%S")
            kept = DRY_RUN_CSV.replace(".csv", f"_{stamp}.csv")
            os.replace(DRY_RUN_CSV, kept)
            print(f"Previous dry-run log kept as {kept}")
        csv_file = open(DRY_RUN_CSV, "w", newline="")
        csv_writer = csv.DictWriter(
            csv_file,
            fieldnames=["timestamp", *ML_FEATURES, "prediction", "score", "streak", "would_trigger"],
        )
        csv_writer.writeheader()
    else:
        from agent import trigger_ai_agent

    print("✅ Model loaded. Starting continuous monitoring...")

    stats = {
        "evaluated": 0, "anomalous": 0, "triggers": 0,
        "skipped_settling": 0, "skipped_low_traffic": 0, "skipped_missing": 0,
    }
    started_at = time.monotonic()
    anomaly_streak = 0
    last_replicas = None
    replicas_changed_at = None
    cooldown_until = 0.0

    try:
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
                stats["skipped_missing"] += 1
                anomaly_streak = 0
                time.sleep(INTERVAL_SECONDS)
                continue

            cpu = float(current_metrics.get("avg_cpu_per_pod", 0.0) or 0.0)
            throttling = float(current_metrics.get("cpu_throttling", 0.0) or 0.0)
            replicas = float(current_metrics.get("active_replicas", 0.0) or 0.0)
            latency = float(current_metrics.get("latency_p95", 0.0) or 0.0)
            throughput = float(current_metrics.get("throughput", 0.0) or 0.0)

            timestamp = datetime.now().strftime("%H:%M:%S")

            # Stabilization gate: skip readings while a replica change settles.
            if last_replicas is not None and replicas != last_replicas:
                replicas_changed_at = time.monotonic()
            last_replicas = replicas
            if replicas_changed_at is not None:
                settle_left = REPLICA_SETTLE_SECONDS - (time.monotonic() - replicas_changed_at)
                if settle_left > 0:
                    print(
                        f"[{timestamp}] Replicas changed to {replicas:.0f} — "
                        f"settling, {settle_left:.0f}s left before evaluating."
                    )
                    stats["skipped_settling"] += 1
                    anomaly_streak = 0
                    time.sleep(INTERVAL_SECONDS)
                    continue

            # Data quality gate: not enough traffic signal for a meaningful
            # health evaluation (same logic as the NaN skip).
            if throughput < MIN_THROUGHPUT_RPS:
                print(f"[{timestamp}] Low traffic ({throughput:.2f} rps) — skipping prediction.")
                stats["skipped_low_traffic"] += 1
                anomaly_streak = 0
                time.sleep(INTERVAL_SECONDS)
                continue

            # The model for the current replica count knows that count's healthy
            # band: below it = over-provisioned (waste), above it = overloaded,
            # latency far above it = stuck code.
            prediction, score = evaluate(bundle, current_metrics)
            stats["evaluated"] += 1

            score_text = f"{score:+.4f}" if score is not None else f"no model for {replicas:.0f} replicas"
            print(
                f"cpu: {cpu:.3f}, throttling: {throttling:.3f}, "
                f"latency: {latency:.3f}, throughput: {throughput:.3f}, "
                f"replicas: {replicas:.0f}, prediction: {prediction} (score {score_text})"
            )

            if prediction == -1:
                stats["anomalous"] += 1
                anomaly_streak += 1
            else:
                anomaly_streak = 0
            cooldown_left = cooldown_until - time.monotonic()
            should_trigger = anomaly_streak >= ANOMALY_STREAK_REQUIRED and cooldown_left <= 0

            if dry_run:
                csv_writer.writerow({
                    "timestamp": timestamp,
                    **{feature: current_metrics[feature] for feature in ML_FEATURES},
                    "prediction": prediction,
                    "score": round(score, 4) if score is not None else "",
                    "streak": anomaly_streak,
                    "would_trigger": should_trigger,
                })
                csv_file.flush()

            if prediction != -1:
                print(f"[{timestamp}]  Normal operation.")
                time.sleep(INTERVAL_SECONDS)
                continue

            if not should_trigger:
                if anomaly_streak >= ANOMALY_STREAK_REQUIRED:
                    print(f"[{timestamp}] Anomaly confirmed, but agent cooldown has {cooldown_left:.0f}s left.")
                else:
                    print(
                        f"[{timestamp}] Anomalous reading {anomaly_streak}/"
                        f"{ANOMALY_STREAK_REQUIRED} — waiting for confirmation."
                    )
                time.sleep(INTERVAL_SECONDS)
                continue

            anomaly_streak = 0
            stats["triggers"] += 1

            print(f"\n[{timestamp}] ANOMALY DETECTED!")
            # Για καλύτερη απεικόνιση τυπώνουμε το Throttling ως ποσοστό
            print(f"Metrics: Tput: {current_metrics['throughput']:.1f} | CPU: {current_metrics['avg_cpu_per_pod']:.2f} | Throttling: {current_metrics['cpu_throttling']*100:.1f}% | Latency: {current_metrics['latency_p95']:.3f}s")

            if dry_run:
                print("🧪 [DRY RUN] The agent would be woken up now — not calling it.")
            else:
                metrics_json = json.dumps(current_metrics)

                print("Αναμονή ολοκλήρωσης ενεργειών από τον Agent...")
                is_resolved = trigger_ai_agent(metrics_json)

                if is_resolved:
                    print(f"\n[{datetime.now().strftime('%H:%M:%S')}]  Το πρόβλημα επιλύθηκε από τον Agent. Επανεκκίνηση παρακολούθησης.")
                else:
                    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Ο Agent δεν επιβεβαίωσε επίλυση. Επανεκκίνηση παρακολούθησης.")

            cooldown_until = time.monotonic() + AGENT_COOLDOWN_SECONDS
            print(f"Agent cooldown {AGENT_COOLDOWN_SECONDS}s (monitoring continues).")
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped by user.")
    finally:
        print_summary(stats, started_at, dry_run)
        if dry_run:
            csv_file.close()


def _stop_on_sigterm(*_):
    # The experiment scripts stop controllers with SIGTERM (background jobs of a
    # non-interactive shell ignore SIGINT). Treat it like Ctrl+C so the summary prints.
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _stop_on_sigterm)
    parser = argparse.ArgumentParser(description="ML anomaly monitor that wakes the AIOps agent.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate and log anomalies without calling the agent (no LLM calls, no cluster changes).",
    )
    run_monitor(dry_run=parser.parse_args().dry_run)
