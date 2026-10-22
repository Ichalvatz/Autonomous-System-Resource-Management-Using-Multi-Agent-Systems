"""
Evidence for decision A2/A3 (thesis_notes/design_decisions.md): why a One-Class SVM and not an Isolation Forest,
and what each feature transform does. Every number in A2's "re-check 2026-10-10" part comes from this script.

Read-only: it refits models in memory from 5-ml-training/phase1/baseline_metrics_healthy.csv with the repo's own
training code and compares them with the saved health_model.pkl; it writes nothing into the repo.
Isolation Forests use contamination = nu = 0.02 (same share of healthy training readings left outside) and
200 trees; "x/20" means caught in x of 20 random seeds.

Run from the repo root:  .venv/bin/python3 -W ignore thesis_notes/figures/detector_evidence.py   (~1 min)
"""
import contextlib
import io
import os
import sys
import tempfile

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.svm import OneClassSVM

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ML = os.path.join(ROOT, "5-ml-training", "phase1")  # phase-1 pipeline and data (moved 2026-10-22)
sys.path.insert(0, ML)
import train_health_baseline as tb  # noqa: E402  (main() is not called)

tb.OUTPUT_CSV = os.path.join(tempfile.gettempdir(), "aiops_filtered_copy.csv")  # not the repo's file
F = tb.FEATURES
C = 0.073  # healthy CPU cost per request (core-s), median of the data
data = tb.load_data()
health, reasons = tb.build_health_dataset(data)
saved = joblib.load(os.path.join(ML, "health_model.pkl"))["models"]
old_path = os.path.join(ML, "isolation_forest_baseline.pkl")
old = joblib.load(old_path) if os.path.exists(old_path) else None  # last real IF (gitignored: may be absent)


def per(reps):
    return health[health.active_replicas == reps][F].reset_index(drop=True)


def row(rps, reps, p95=0.10, thr=0.02, cpu=None):
    return pd.DataFrame([dict(avg_cpu_per_pod=C * rps / reps if cpu is None else cpu,
                              latency_p95=p95, cpu_throttling=thr, throughput=rps)])[F]


def forests(train, n=20):
    return [IsolationForest(n_estimators=200, contamination=0.02, random_state=s).fit(train) for s in range(n)]


def caught(fs, x):
    return sum(f.predict(x)[0] == -1 for f in fs)


def old_says(x, reps):
    if old is None:
        return "n/a"
    s = old.decision_function(x.assign(active_replicas=reps)[list(old.feature_names_in_)])[0]
    return f"{'ANOMALY' if s < 0 else 'healthy'} {s:+.4f}"


print("== 1. Data and the deployed model")
print(f"readings {len(data)}, healthy {len(health)}, rejected {reasons}")
for r in (1, 2, 3):
    g = per(r)
    refit = tb.fit_per_replica(health, tb.make_ocsvm)[r]
    diff = np.abs(refit.decision_function(g) - saved[r].decision_function(g)).max()
    svm = saved[r].named_steps["ocsvm"]
    print(f"  {r} pod(s): {len(g)} readings, rps {g.throughput.min():.2f}-{g.throughput.max():.2f}; refit vs saved max diff "
          f"{diff:.1e}; support vectors {len(svm.support_)} (rps {sorted(g.throughput.iloc[svm.support_].round(2))}), rho {svm.offset_[0]:.4f}")
with contextlib.redirect_stdout(io.StringIO()) as out:
    failed = tb.validate(saved, health)
f, t, runs = tb.held_out_false_alarms(health, tb.make_ocsvm)
print(f"  probes failed {failed}/20; held-out {f}/{t} = {f / t * 100:.1f}%, {runs} runs of 3 in a row")

print("\n== 2. Design alternatives on the real data (probes failed / held-out false alarms)")
log = FunctionTransformer(np.log)


def ocsvm(gamma=0.02, floors=True, use_log=True):
    def make():
        if floors:
            load = make_pipeline(tb._numpy_step(np.maximum, 1e-3), log) if use_log else "passthrough"
            cols = ColumnTransformer([
                ("load", load, ["avg_cpu_per_pod", "throughput"]),
                ("lat", make_pipeline(tb._numpy_step(np.maximum, 0.2), log, tb._numpy_step(np.multiply, 4.0)), ["latency_p95"]),
                ("thr", make_pipeline(tb._numpy_step(np.maximum, 0.05), tb._numpy_step(np.multiply, 20.0)), ["cpu_throttling"])])
            scale = ColumnTransformer([("s", StandardScaler(), [0, 1])], remainder="passthrough")
        else:  # log of cpu, rps and latency, everything standardized per replica count (no floors)
            cols = ColumnTransformer([
                ("load", make_pipeline(tb._numpy_step(np.maximum, 1e-3), log), ["avg_cpu_per_pod", "throughput", "latency_p95"]),
                ("thr", "passthrough", ["cpu_throttling"])])
            scale = StandardScaler()
        return Pipeline([("f", cols), ("s", scale), ("m", OneClassSVM(kernel="rbf", nu=0.02, gamma=gamma))])
    return make


variants = {"final (log + floors, gamma 0.02)": ocsvm(), "no floors (all standardized)": ocsvm(floors=False),
            "gamma 0.1": ocsvm(gamma=0.1), "gamma 0.005": ocsvm(gamma=0.005), "linear cpu/rps (no log)": ocsvm(use_log=False),
            "Isolation Forest per pod count": lambda: IsolationForest(n_estimators=200, contamination=0.02, random_state=42)}
for name, make in variants.items():
    with contextlib.redirect_stdout(io.StringIO()) as out:
        failed = tb.validate(tb.fit_per_replica(health, make), health)
    fails = [ln.split("❌")[1].split("→")[0].strip() for ln in out.getvalue().splitlines() if "❌" in ln]
    f, t, runs = tb.held_out_false_alarms(health, make)
    print(f"  {name:34s} probes failed {failed}/20, held-out {f / t * 100:4.1f}% ({runs} runs of 3)  {fails}")

print("\n== 3. Latency weight: score of a 2-pod mid-band reading (> 0 healthy)")
mid2 = float(np.sqrt(per(2).throughput.min() * per(2).throughput.max()))
for w in (1, 2, 4, 8):
    tb.LAT_WEIGHT = w
    m = tb.make_ocsvm().fit(per(2))
    print(f"  x{w}: " + " | ".join(f"p95 {p} {m.decision_function(row(mid2, 2, p, 0.03))[0]:+.3f}" for p in (0.19, 0.3, 0.35, 0.4, 5.0)))
tb.LAT_WEIGHT = 4.0

print("\n== 4. Isolation Forest, novelty mode: a value beyond the healthy range scores exactly like the edge")
tr2 = per(2)
f42 = IsolationForest(n_estimators=200, contamination=0.02, random_state=42).fit(tr2)
lo, hi = tr2.min(), tr2.max()
pts = {"waste 3 rps": row(3.0, 2, thr=0.0, cpu=0.11), "overload": row(25.9, 2, 0.4, 0.08, cpu=0.9),
       "stuck p95 5 s": row(14.4, 2, 5.0, 0.03, cpu=0.53), "in-range combo: cpu 0.70 at 8 rps": row(8.0, 2, cpu=0.70)}
for name, x in pts.items():
    xc = x.clip(lower=lo, upper=hi, axis=1)
    print(f"  {name:34s} IF {f42.decision_function(x)[0]:+.4f}, clamped to the edges {f42.decision_function(xc)[0]:+.4f}, "
          f"OCSVM {saved[2].decision_function(x)[0]:+.4f}")
print("  sweep (2 pods): " + ", ".join(f"{v:.1f} rps IF {f42.decision_function(row(v, 2, thr=0.03))[0]:+.4f} / OCSVM "
                                         f"{saved[2].decision_function(row(v, 2, thr=0.03))[0]:+.3f}" for v in (2.9, 4.3, 5.8, 25.9, 32.3)))
print("  p95 at mid-band (2 pods): " + ", ".join(f"{p} s IF {f42.decision_function(row(mid2, 2, p, 0.03))[0]:+.4f}" for p in (0.4, 1.0, 5.0)))

print("\n== 5. Novelty mode (ours) vs outlier mode (textbook: the anomaly is in the training data), 2 pods")
fs2 = forests(tr2)
for name, x in pts.items():
    outlier = sum(IsolationForest(n_estimators=200, contamination=0.02, random_state=s)
                  .fit(pd.concat([tr2, x], ignore_index=True)).predict(x)[0] == -1 for s in range(20))
    print(f"  {name:34s} novelty {caught(fs2, x):2d}/20, outlier {outlier:2d}/20")

print("\n== 6. Toy: healthy rps uniform 5-10 (60 readings), 1 feature")
h15 = h1000 = same = 0
for s in range(50):
    X = np.random.default_rng(s).uniform(5, 10, 60).reshape(-1, 1)
    fo = IsolationForest(n_estimators=200, contamination=0.02, random_state=s).fit(X)
    a, b, c = (fo.decision_function([[v]])[0] for v in (15, 1000, X.max()))
    h15 += a < 0; h1000 += b < 0; same += a == b == c
print(f"  15 rps flagged {h15}/50, 1000 rps {h1000}/50; score(15) == score(1000) == score(max healthy) in {same}/50")

print("\n== 7. Real data: the bottom of the 2-pod band is a crowd, not a lonely edge")
sc = f42.decision_function(tr2)
print(f"  {int((tr2.throughput < 10).sum())} healthy readings below 10 rps; the 3 lowest rank " +
      ", ".join(str(int((sc < sc[i]).sum()) + 1) for i in tr2.throughput.nsmallest(3).index) + f" of {len(tr2)} (1 = most isolated)")

print("\n== 8. Points INSIDE the healthy box (2 pods): thin tails vs diagonal holes")
inside = {"crowd: 14 rps, p95 0.10, thr 2%": row(14, 2, 0.10, 0.02, cpu=0.53),
          "thin tail: 14 rps, p95 0.19, thr 6%": row(14, 2, 0.19, 0.06, cpu=0.53),
          "all max: 21 rps, cpu 0.77, p95 0.19, thr 6%": row(21, 2, 0.19, 0.06, cpu=0.77),
          "diagonal hole: 8 rps with cpu 0.70": row(8, 2, cpu=0.70),
          "diagonal hole: 21 rps with cpu 0.26": row(21, 2, cpu=0.26)}
for name, x in inside.items():
    depth = np.mean([np.mean([t.decision_path(x.values.astype(np.float32)).sum() - 1 for t in fo.estimators_]) for fo in fs2[:5]])
    print(f"  {name:44s} mean depth {depth:.2f}, IF {caught(fs2, x):2d}/20, OCSVM {saved[2].decision_function(x)[0]:+.3f}")

print("\n== 9. One extreme value vs all high vs all low (old IF | IF per pod count | OCSVM)")
for r in (1, 2, 3):
    g = per(r); lo_r, hi_r = g.throughput.min(), g.throughput.max(); mid = float(np.sqrt(lo_r * hi_r)); fs = forests(g)
    states = {"only latency 0.4 s": row(mid, r, 0.4), "only latency 5 s": row(mid, r, 5.0), "only throttling 15%": row(mid, r, thr=0.15),
              "all high (overload)": row(1.2 * hi_r, r, 0.4, 0.08, cpu=0.9), "all low (waste 0.6x)": row(0.6 * lo_r, r, thr=0.005),
              "real stuck (p95 3 s, rps and cpu fall)": row(2.5, r, 3.0, 0.0, cpu=0.03)}
    for name, x in states.items():
        print(f"  {r}p {name:40s} {old_says(x, r):>16} | {caught(fs, x):2d}/20 | {saved[r].decision_function(x)[0]:+.3f}")
for r in (1, 2, 3):
    mid = float(np.sqrt(per(r).throughput.min() * per(r).throughput.max()))
    thr = next(v for v in np.arange(0.05, 0.4, 0.005) if saved[r].decision_function(row(mid, r, thr=v))[0] < 0)
    print(f"  {r}p: OCSVM flags throttling alone from {thr * 100:.1f}%")

print("\n== 10. The real last Isolation Forest (one model for all pod counts) on the demo's states")
for name, x, r in [("2 pods 5 rps (demo 2->1)", row(5, 2, thr=0.03), 2), ("3 pods 12.6 rps (demo 3->2)", row(12.6, 3, thr=0.03), 3),
                   ("2 pods 0 rps", row(0, 2, thr=0.0, cpu=0.005), 2), ("2 pods 1.5 rps", row(1.5, 2, thr=0.0), 2),
                   ("2 pods 3 rps", row(3.0, 2, thr=0.0), 2)]:
    print(f"  {name:28s} {old_says(x, r)}")

print("\n== 11. Unhealthy examples in the training data: 3 waste readings (3, 4, 5 rps) added to the 2-pod data")
mix = pd.concat([tr2] + [row(v, 2, thr=0.0) for v in (3.0, 4.0, 5.0)], ignore_index=True)
fm = forests(mix)
print(f"  new waste 4.5 rps caught {caught(fm, row(4.5, 2, thr=0.0))}/20; healthy mid-band {caught(fm, row(14.4, 2, cpu=0.53))}/20")

print("\n== 12. Why transforms (A3): raw-unit distances and log vs linear, 2 pods")
a = dict(avg_cpu_per_pod=0.50, latency_p95=0.099, cpu_throttling=0.03, throughput=14.0)
for name, key, val in [("rps 14 -> 15", "throughput", 15.0), ("throttling 3% -> 18%", "cpu_throttling", 0.18),
                       ("p95 0.099 -> 0.5 s", "latency_p95", 0.5)]:
    print(f"  raw squared distance, {name}: {(val - a[key]) ** 2:.3f}")
lo2, hi2 = tr2.throughput.min(), tr2.throughput.max()
for label, fn in [("linear", lambda v: v), ("log", np.log)]:
    vals = fn(tr2.throughput); mu, sd = vals.mean(), vals.std(ddof=0)
    z = lambda v: (fn(v) - mu) / sd
    print(f"  {label:6s}: waste 0.8x is {z(lo2) - z(0.8 * lo2):.2f} std below the bottom, overload 1.2x is {z(1.2 * hi2) - z(hi2):.2f} std above the top")
