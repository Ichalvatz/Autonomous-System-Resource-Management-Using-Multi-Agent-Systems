"""
Phase 3 — train one One-Class SVM per replica count.

Why One-Class SVM and not Isolation Forest (see CLAUDE.md, "Model choice"):
an Isolation Forest only cuts between the min and max of the training data,
so every point beyond the healthy range gets exactly the score of the range's
edge. It can tell *that* a point is past the edge, never *how far*. It misses
one-directional drift: over-provisioning (only CPU and throughput drop) and
stuck code (only latency rises). A One-Class SVM scores by RBF distance to the
healthy data, so far from it the score always drops below the threshold.

Why one model per replica count: with a single model, "2 pods at 15% CPU and
5 rps" differs from healthy 1-pod data only in `active_replicas`. A model per
replica count learns that count's own healthy band; below it means
over-provisioned (scale down), above it means overloaded (scale up).

active_replicas is therefore not a model feature; it selects the model.
The saved file is a dict:
    {"model_type": "ocsvm", "features": [...], "models": {1: Pipeline, 2: ..., 3: ...}}
anomaly_detector.py picks models[active_replicas].
"""
import functools
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.svm import OneClassSVM

BASE_DIR = Path(__file__).resolve().parent
INPUT_CSV = BASE_DIR / "baseline_metrics_healthy.csv"
OUTPUT_CSV = BASE_DIR / "baseline_metrics_healthy_filtered.csv"
MODEL_FILE = BASE_DIR / "health_model.pkl"

FEATURES = [
    "avg_cpu_per_pod",
    "latency_p95",
    "cpu_throttling",
    "throughput",
]

# Health SLO thresholds — define the boundary of "normal operation."
# These should represent comfortable operating conditions, not breaking points.
MAX_CPU_PER_POD = 0.95       # Reserve headroom below the 1-core limit
# Seconds. Same as the agent's SLO (agent.py: p95 > 0.35s = scale up), so the
# model never learns as "healthy" a state the agent treats as an SLO violation.
# (2026-09-30 run: a 45s host hiccup at 3 replicas / 28-29 VUs read p95 0.5-0.69s.)
MAX_LATENCY_P95 = 0.35
MAX_CPU_THROTTLING = 0.10    # Ratio — above 10% indicates resource starvation
MIN_SAMPLES_PER_MODEL = 20

# One-Class SVM preprocessing (the RBF kernel is distance-based):
# - cpu, throughput: log, then StandardScaler per replica count. Log because
#   load bands are ratio-wide (2 pods: 7 -> 22 rps) and waste is a ratio ("load
#   is 60% of what this pod count is for"); in linear units a 20% shortfall
#   below the 2-pod band was only ~0.3 std and was missed. Clipped at 0.001 so a
#   zero reading scores as an anomaly instead of log(0) = -inf.
# - latency: max(p95, LAT_FLOOR), log, x LAT_WEIGHT, no data-based scaling.
#   Real p95 sits on histogram-bucket plateaus (~0.075 / ~0.099 / ~0.17 s) and
#   the plateau drifts over time independent of load. Standardized per replica
#   count, a healthy 0.075 -> 0.099 switch looked like a big jump: 49.5% held-out
#   false alarms on the 2026-09-30 data. Under the floor every latency counts the
#   same, above it the fixed weight makes 0.4 s clearly anomalous and 5 s extreme.
# - throttling: max(ratio, THR_FLOOR) x THR_WEIGHT, same idea at the agent's 5% SLO.
LAT_FLOOR = 0.2      # s; healthy data tops out at ~0.19 s, agent SLO is 0.35 s
LAT_WEIGHT = 4.0     # 0.35 s -> 2.2 units above the floor, 5 s -> 12.9 units
THR_FLOOR = 0.05     # agent SLO: throttling < 5%
THR_WEIGHT = 20.0    # +5 percentage points above the floor = 1 unit
# NU: upper bound on the share of healthy training readings left outside the
#     boundary (the role contamination had in Isolation Forest).
# GAMMA: how tight the boundary is. Higher catches smaller shifts but flags more
#     healthy readings. Tuned on the 2026-09-30 real data (up/down held-out):
#     0.02 passed all probes with ~11% held-out false alarms (pessimistic) and
#     kept the demo's steady states (5/20/30/14 VUs) normal.
OCSVM_NU = 0.02
OCSVM_GAMMA = 0.02

# How deep below the band the WASTE probe sits. The demo's scale-down steps in
# baseline.js sit at about 0.6x (5 VUs on 2 pods) and 0.8x (14 VUs on 3 pods).
WASTE_FACTOR = 0.8
# Consecutive anomalous readings the detector needs to wake the agent.
STREAK_REQUIRED = 3


def _numpy_step(func, *args):
    return FunctionTransformer(functools.partial(func, *args))


def make_ocsvm():
    # Only numpy functions inside FunctionTransformer, so the pickle loads in
    # anomaly_detector.py without importing this module.
    load = make_pipeline(_numpy_step(np.maximum, 1e-3), FunctionTransformer(np.log))
    latency = make_pipeline(
        _numpy_step(np.maximum, LAT_FLOOR), FunctionTransformer(np.log), _numpy_step(np.multiply, LAT_WEIGHT)
    )
    throttling = make_pipeline(_numpy_step(np.maximum, THR_FLOOR), _numpy_step(np.multiply, THR_WEIGHT))
    features = ColumnTransformer([
        ("load", load, ["avg_cpu_per_pod", "throughput"]),   # -> columns 0, 1
        ("latency", latency, ["latency_p95"]),              # -> column 2
        ("throttling", throttling, ["cpu_throttling"]),     # -> column 3
    ])
    # Standardize only the load columns; latency and throttling keep their fixed scale.
    scale_load = ColumnTransformer([("scaler", StandardScaler(), [0, 1])], remainder="passthrough")
    return Pipeline([
        ("features", features),
        ("scale_load", scale_load),
        ("ocsvm", OneClassSVM(kernel="rbf", nu=OCSVM_NU, gamma=OCSVM_GAMMA)),
    ])


def load_data():
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Input dataset not found: {INPUT_CSV}")

    data = pd.read_csv(INPUT_CSV)
    required_columns = {"timestamp", "active_replicas", *FEATURES}
    missing_columns = sorted(required_columns - set(data.columns))
    if missing_columns:
        raise ValueError(f"Dataset is missing columns: {missing_columns}")

    numeric = [*FEATURES, "active_replicas"]
    data[numeric] = data[numeric].apply(pd.to_numeric, errors="coerce")
    return data


def build_health_dataset(data):
    # No replica-transition filter: collect_healthy_data.py waits for the pods
    # to be ready plus 60s before the first reading of each replica count.
    numeric = [*FEATURES, "active_replicas"]
    valid = data[numeric].notna().all(axis=1)
    non_negative = (data[numeric] >= 0).all(axis=1)
    within_slo = (
        (data["avg_cpu_per_pod"] <= MAX_CPU_PER_POD)
        & (data["latency_p95"] < MAX_LATENCY_P95)
        & (data["cpu_throttling"] < MAX_CPU_THROTTLING)
        & (data["active_replicas"] >= 1)
    )

    health_mask = valid & non_negative & within_slo
    health_data = data.loc[health_mask].copy()
    health_data["active_replicas"] = health_data["active_replicas"].round().astype(int)
    health_data.to_csv(OUTPUT_CSV, index=False)

    rejection_reasons = {
        "invalid_or_missing": int((~valid).sum()),
        "negative_metric": int((valid & ~non_negative).sum()),
        "outside_health_limits": int((valid & non_negative & ~within_slo).sum()),
    }
    return health_data, rejection_reasons


def fit_per_replica(health_data, make_model):
    models = {}
    for replicas, group in health_data.groupby("active_replicas"):
        if len(group) < MIN_SAMPLES_PER_MODEL:
            raise ValueError(
                f"Only {len(group)} healthy samples for {replicas} replica(s); "
                f"at least {MIN_SAMPLES_PER_MODEL} are required."
            )
        models[int(replicas)] = make_model().fit(group[FEATURES])
    return models


def build_probes(health_data):
    """Probes derived from the measured bands, so they test the real
    scale-up / scale-down / stuck-code situations of this cluster."""
    # CPU cost of one request (core-seconds), measured from the data.
    cost = float(np.median(
        health_data["avg_cpu_per_pod"] * health_data["active_replicas"]
        / health_data["throughput"]
    ))
    lat = float(health_data["latency_p95"].median())
    thr = float(health_data["cpu_throttling"].median())
    counts = sorted(health_data["active_replicas"].unique())

    def row(label, replicas, rps, expect_anomaly, latency=lat, throttling=thr, cpu=None):
        return {
            "label": label, "replicas": int(replicas), "expect_anomaly": expect_anomaly,
            "avg_cpu_per_pod": cpu if cpu is not None else cost * rps / replicas,
            "latency_p95": latency, "cpu_throttling": throttling, "throughput": rps,
        }

    probes = []
    for r in counts:
        band = health_data.loc[health_data["active_replicas"] == r, "throughput"]
        lo, hi = float(band.min()), float(band.max())
        probes.append(row(f"{r}p HEALTHY mid-band", r, (lo + hi) / 2, False))
        # Over-provisioned: clearly below this count's band.
        if r > counts[0]:
            waste_rps = WASTE_FACTOR * lo
            probes.append(row(f"{r}p WASTE {waste_rps:.1f}rps", r, waste_rps, True))
            # Anti-flapping: after scaling down, the smaller count must see that load as normal.
            probes.append(row(f"{r - 1}p AFTER scale-down {waste_rps:.1f}rps", r - 1, waste_rps, False))
        # Overloaded: above this count's safe max.
        probes.append(row(f"{r}p OVERLOAD {1.15 * hi:.1f}rps", r, 1.15 * hi, True,
                          latency=0.4, throttling=0.08, cpu=0.9))
        # Stuck code: normal traffic, latency 5s.
        probes.append(row(f"{r}p STUCK p95=5s", r, (lo + hi) / 2, True, latency=5.0))
        # Latency alone: 0.19 s is the top of healthy, 0.4 s breaks the agent's 0.35 s SLO.
        probes.append(row(f"{r}p p95=0.19s (healthy top)", r, (lo + hi) / 2, False, latency=0.19))
        probes.append(row(f"{r}p SLOW p95=0.4s", r, (lo + hi) / 2, True, latency=0.4))

    low = health_data[(health_data["active_replicas"] == counts[0])
                      & (health_data["throughput"] < 1.5)]
    if len(low):
        probes.append(row(f"{counts[0]}p LOW traffic ~1rps", counts[0], float(low["throughput"].median()),
                          False, latency=float(low["latency_p95"].quantile(0.9)),
                          cpu=float(low["avg_cpu_per_pod"].median())))
    return pd.DataFrame(probes)


def longest_true_runs(flags):
    """Number of runs of >= STREAK_REQUIRED consecutive True values."""
    runs, streak = 0, 0
    for flag in flags:
        streak = streak + 1 if flag else 0
        if streak == STREAK_REQUIRED:
            runs += 1
    return runs


def held_out_false_alarms(health_data, make_model):
    """False-alarm estimate on readings the model hasn't seen: train on the
    ramp-up readings of each replica count and score the ramp-down readings,
    then the other way round. Each half-model sees only half the data, so this
    is pessimistic: in simulation it read ~2x the rate on a fresh dataset.
    The real check is `anomaly_detector.py --dry-run` on healthy traffic.
    Needs the `vus` column written by collect_healthy_data.py."""
    if "vus" not in health_data.columns:
        return None
    flagged, total, triggers = 0, 0, 0
    for _, group in health_data.groupby("active_replicas"):
        group = group.sort_index()
        peak = group.index[group["vus"].argmax()]
        up, down = group.loc[:peak], group.loc[peak:].iloc[1:]
        for train, test in ((up, down), (down, up)):
            if len(train) < MIN_SAMPLES_PER_MODEL // 2 or not len(test):
                continue
            flags = make_model().fit(train[FEATURES]).predict(test[FEATURES]) == -1
            flagged += int(flags.sum())
            total += len(flags)
            triggers += longest_true_runs(flags)
    return flagged, total, triggers


def validate(models, health_data):
    print("\n--- Training data (per replica count) ---")
    for replicas, model in models.items():
        group = health_data[health_data["active_replicas"] == replicas]
        scores = model.decision_function(group[FEATURES])
        n_flagged = int((model.predict(group[FEATURES]) == -1).sum())
        print(
            f"  {replicas} replica(s): {n_flagged}/{len(group)} flagged  "
            f"score min={scores.min():+.4f} median={np.median(scores):+.4f} max={scores.max():+.4f}"
        )

    probes = build_probes(health_data)
    print("--- Probes (derived from the measured bands) ---")
    failed = 0
    for _, p in probes.iterrows():
        model = models[p["replicas"]]
        x = p[FEATURES].to_frame().T.astype(float)
        is_anomaly = model.predict(x)[0] == -1
        score = model.decision_function(x)[0]
        ok = is_anomaly == p["expect_anomaly"]
        failed += not ok
        verdict = "ANOMALY" if is_anomaly else "normal"
        print(
            f"  {'✅' if ok else '❌'} {p['label']:32s} → {verdict:7s} (score: {score:+.4f})  "
            f"cpu={p['avg_cpu_per_pod']:.2f} p95={p['latency_p95']:.2f}"
        )
    print(f"  {'✅ All probes passed.' if not failed else f'⚠️  {failed} probe(s) failed.'}")
    return failed


def main():
    data = load_data()
    health_data, rejection_reasons = build_health_dataset(data)

    models = fit_per_replica(health_data, make_ocsvm)
    validate(models, health_data)
    held_out = held_out_false_alarms(health_data, make_ocsvm)
    if held_out:
        flagged, total, triggers = held_out
        print(
            f"--- Held-out healthy readings (train on ramp-up, test on ramp-down and back;"
            f" pessimistic, ~2x the real rate) ---\n"
            f"  {flagged}/{total} flagged ({flagged / total * 100:.1f}%), "
            f"{triggers} run(s) of {STREAK_REQUIRED}+ in a row (= would wake the agent)"
        )

    joblib.dump({"model_type": "ocsvm", "features": FEATURES, "models": models}, MODEL_FILE)

    print(f"\n--- Health Filter Summary ---")
    print(f"  Input samples:           {len(data)}")
    print(f"  Healthy samples:         {len(health_data)}")
    print(f"  Rejected samples:        {len(data) - len(health_data)}")
    print(f"  Rejection reasons:       {rejection_reasons}")
    print(f"  Healthy band per replica count:")
    bands = health_data.groupby("active_replicas")[FEATURES].agg(["min", "max"])
    print("  " + bands.round(3).to_string().replace("\n", "\n  "))
    print(f"\n  Healthy dataset saved to: {OUTPUT_CSV}")
    print(f"  Models saved to: {MODEL_FILE}")


if __name__ == "__main__":
    main()
