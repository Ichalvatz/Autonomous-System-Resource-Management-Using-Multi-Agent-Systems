from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "baseline_metrics_healthy.csv"
OUTPUT_CSV = BASE_DIR / "baseline_metrics_healthy_filtered.csv"
MODEL_FILE = BASE_DIR / "isolation_forest_baseline.pkl"

FEATURES = [
    "avg_cpu_per_pod",
    "latency_p95",
    "cpu_throttling",
    "throughput",
    "active_replicas",
]

# Health SLO thresholds — define the boundary of "normal operation."
# These should represent comfortable operating conditions, not breaking points.
MAX_CPU_PER_POD = 0.95       # Reserve headroom below the 1-core limit
MAX_LATENCY_P95 = 1.5        # Seconds — above this, user experience degrades
MAX_CPU_THROTTLING = 0.10    # Ratio — above 10% indicates resource starvation
MIN_REPLICAS = 1
STABILIZATION_SAMPLES = 2    # Skip samples right after replica changes


def load_data():
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Input dataset not found: {INPUT_CSV}")

    data = pd.read_csv(INPUT_CSV)
    required_columns = {"timestamp", *FEATURES}
    missing_columns = sorted(required_columns - set(data.columns))
    if missing_columns:
        raise ValueError(f"Dataset is missing columns: {missing_columns}")

    data[FEATURES] = data[FEATURES].apply(pd.to_numeric, errors="coerce")
    return data


def build_health_dataset(data):
    valid = data[FEATURES].notna().all(axis=1)
    non_negative = (data[FEATURES] >= 0).all(axis=1)
    within_slo = (
        (data["avg_cpu_per_pod"] <= MAX_CPU_PER_POD)
        & (data["latency_p95"] < MAX_LATENCY_P95)
        & (data["cpu_throttling"] < MAX_CPU_THROTTLING)
        & (data["active_replicas"] >= MIN_REPLICAS)
    )

    replica_transition = data["active_replicas"].ne(
        data["active_replicas"].shift()
    )
    transition_window = replica_transition.copy()
    for offset in range(1, STABILIZATION_SAMPLES):
        transition_window |= replica_transition.shift(offset, fill_value=False)

    health_mask = valid & non_negative & within_slo & ~transition_window
    health_data = data.loc[health_mask].copy()
    health_data.to_csv(OUTPUT_CSV, index=False)

    rejection_reasons = {
        "invalid_or_missing": int((~valid).sum()),
        "negative_metric": int((valid & ~non_negative).sum()),
        "outside_health_limits": int((valid & non_negative & ~within_slo).sum()),
        "replica_stabilization_window": int(
            (valid & non_negative & within_slo & transition_window).sum()
        ),
    }
    return health_data, rejection_reasons


def train_model(health_data):
    if len(health_data) < 30:
        raise ValueError(
            f"Only {len(health_data)} healthy samples remain; "
            f"at least 30 are required."
        )

    # Pipeline: StandardScaler normalizes all 5 features to zero mean and unit
    # variance so that throughput (range ~36) doesn't dominate over throttling
    # (range ~0.18) in the Isolation Forest's random splits.
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("isolation_forest", IsolationForest(
            n_estimators=300,
            contamination=0.01,   # Low: we KNOW all training data is healthy
            random_state=42,
        )),
    ])
    pipeline.fit(health_data[FEATURES])
    joblib.dump(pipeline, MODEL_FILE)
    return pipeline


def validate_model(pipeline, health_data):
    """Run the trained model against training data and synthetic anomalies."""

    # --- Score distribution on healthy training data ---
    scores = pipeline.decision_function(health_data[FEATURES])
    predictions = pipeline.predict(health_data[FEATURES])
    n_flagged = int((predictions == -1).sum())

    print("\n--- Model Validation on Training Data ---")
    print(f"  Healthy samples scored:   {len(health_data)}")
    print(
        f"  Flagged as anomaly (-1):  {n_flagged} "
        f"({n_flagged / len(health_data) * 100:.1f}%)"
    )
    print(
        f"  Score distribution:       "
        f"min={scores.min():.4f}  "
        f"median={np.median(scores):.4f}  "
        f"max={scores.max():.4f}"
    )

    # Per-replica breakdown: are any scale levels disproportionately flagged?
    print("\n  Per-replica anomaly rate:")
    for replica_count in sorted(health_data["active_replicas"].unique()):
        mask = health_data["active_replicas"] == replica_count
        rep_preds = predictions[mask.values]
        rep_total = len(rep_preds)
        rep_anom = int((rep_preds == -1).sum())
        print(
            f"    {int(replica_count)} replica(s): "
            f"{rep_anom}/{rep_total} flagged"
        )

    # --- Synthetic anomaly probes ---
    # These represent failure modes the model SHOULD detect.
    synthetic_anomalies = pd.DataFrame([
        # CPU spike: single pod saturated with heavy throttling
        {
            "avg_cpu_per_pod": 1.0, "latency_p95": 2.5,
            "cpu_throttling": 0.35, "throughput": 3.0,
            "active_replicas": 1,
        },
        # Zombie: low CPU but extreme latency (deadlock/stuck requests)
        {
            "avg_cpu_per_pod": 0.05, "latency_p95": 8.0,
            "cpu_throttling": 0.0, "throughput": 0.5,
            "active_replicas": 2,
        },
        # Waste: many replicas, zero traffic
        {
            "avg_cpu_per_pod": 0.02, "latency_p95": 0.1,
            "cpu_throttling": 0.0, "throughput": 0.0,
            "active_replicas": 4,
        },
        # Overloaded: high everything, system buckling
        {
            "avg_cpu_per_pod": 0.95, "latency_p95": 3.0,
            "cpu_throttling": 0.25, "throughput": 40.0,
            "active_replicas": 6,
        },
        # Healthy control — should NOT be flagged
        # Values match typical 1-pod operation at ~5 rps from training data
        {
            "avg_cpu_per_pod": 0.35, "latency_p95": 0.10,
            "cpu_throttling": 0.01, "throughput": 5.0,
            "active_replicas": 1,
        },
    ])
    labels = [
        "CPU_SPIKE", "ZOMBIE", "WASTE", "OVERLOADED", "HEALTHY_CONTROL",
    ]

    probe_preds = pipeline.predict(synthetic_anomalies[FEATURES])
    probe_scores = pipeline.decision_function(synthetic_anomalies[FEATURES])

    print("\n--- Synthetic Anomaly Probes ---")
    for label, pred, score in zip(labels, probe_preds, probe_scores):
        status = "✅ ANOMALY" if pred == -1 else "⚠️  NORMAL"
        print(f"  {label:20s} → {status}  (score: {score:.4f})")

    # Summary check
    anomaly_probes = probe_preds[:4]   # First 4 should be anomalies
    healthy_probe = probe_preds[4]     # Last one should be normal
    if (anomaly_probes == -1).all() and healthy_probe == 1:
        print("\n  ✅ All probes passed — model looks well-calibrated.")
    else:
        print(
            "\n  ⚠️  Some probes failed — consider adjusting health "
            "thresholds or collecting more training data."
        )


def main():
    data = load_data()
    health_data, rejection_reasons = build_health_dataset(data)
    pipeline = train_model(health_data)
    validate_model(pipeline, health_data)

    print(f"\n--- Health Filter Summary ---")
    print(f"  Input samples:           {len(data)}")
    print(f"  Healthy samples:         {len(health_data)}")
    print(f"  Rejected samples:        {len(data) - len(health_data)}")
    print(f"  Rejection reasons:       {rejection_reasons}")
    print(f"  Healthy replica distribution:")
    print(
        "  "
        + health_data["active_replicas"]
        .value_counts()
        .sort_index()
        .to_string()
        .replace("\n", "\n  ")
    )
    print(f"  Healthy metric ranges:")
    print(
        "  "
        + health_data[FEATURES]
        .describe()
        .loc[["min", "max"]]
        .to_string()
        .replace("\n", "\n  ")
    )
    print(f"\n  Healthy dataset saved to: {OUTPUT_CSV}")
    print(f"  Model (Pipeline) saved to: {MODEL_FILE}")


if __name__ == "__main__":
    main()
