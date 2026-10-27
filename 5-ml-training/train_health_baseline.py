#!/usr/bin/env python3
"""
Health model, agent v11 (2026-10-27, design_decisions.md A30; v10 A28 / A28.1): ONE One-Class SVM on the NFR metrics
(load, latency, errors, pod count) that alone decides at run time, with the NFRs (3-ai-agent/nfr_metrics.py) built
into the data, the input units and the acceptance tests. Replaces v10's model (git tag v10-campaign), whose four
input weights came from a grid (A30: the pod weight and the load standardization changed nothing, the latency weight
only set a unit that gamma then compensated).

Input: baseline_metrics_healthy.csv (collect_healthy_data.py), unchanged since 2026-10-23.
  1. Healthy = p95 <= SAFE_P95 (0.25 s, the safe level of the capacity table), errors <= SAFE_ERRORS, >= MIN_RPS, every
     pod ready.
  2. The inputs are in NFR units with no tuned weights (3-ai-agent/health_model.py): ln(throughput); latency and errors
     0 = the safe level, 1 = the objective, everything within the safe level the same (monotone by construction); the
     pod counts far apart. The score lives in health_model.py too (the SVM's decision read as a distance).
  3. The only choice is gamma (the grid of A28); each candidate judged by
       - probes from the measured bands, including p95 = NFR_P95 and NFR_ERRORS at every pod count (all must pass);
       - monotonicity in latency: a slower state is never healthy when the faster one is anomalous, and on the
         anomalous side the score never improves by more than the noise when the latency rises;
       - held-out false alarms: train on the ramp-up readings, score the ramp-down ones, and back;
     with the selection rule declared in A28.
  4. Prints the acceptance criteria of A30 that it can check (probes, monotonicity, held-out wake-ups <= 2).

  python 5-ml-training/train_health_baseline.py            (seconds; read-only except the outputs)

Writes health_model.pkl (bundle, gitignored), baseline_metrics_healthy_filtered.csv and training_report.json.
"""
import itertools
import json
import math
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.svm import OneClassSVM

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "3-ai-agent"))
import health_model as hm  # noqa: E402
import nfr_metrics as nfr  # noqa: E402

INPUT_CSV = HERE / "baseline_metrics_healthy.csv"
OUTPUT_CSV = HERE / "baseline_metrics_healthy_filtered.csv"
MODEL_FILE = HERE / "health_model.pkl"
REPORT_FILE = HERE / "training_report.json"

MIN_RPS = 1.0            # = anomaly_detector.MIN_THROUGHPUT_RPS
NU = 0.02
GAMMAS = [0.1, 0.2, 0.5, 1.0]   # the grid of A28; the only choice since A30
STREAK_REQUIRED = 3
MAX_HELD_OUT_WAKES = 2   # v9's (A26): an acceptance criterion of A28 and A30
ABOVE, WASTE = 1.1, 0.8  # probe positions relative to the band (A28)


def load_healthy():
    data = pd.read_csv(INPUT_CSV)
    keep = ((data["latency_p95"] <= nfr.SAFE_P95) & (data["error_rate"] <= nfr.SAFE_ERRORS)
            & (data["throughput"] >= MIN_RPS)
            & (data["ready_replicas"] == data["replicas"]) & (data["replicas"] == data["replicas_set"]))
    reasons = {
        "above_safe_p95": int((data["latency_p95"] > nfr.SAFE_P95).sum()),
        "errors": int((data["error_rate"] > nfr.SAFE_ERRORS).sum()),
        "low_traffic": int((data["throughput"] < MIN_RPS).sum()),
        "pods_not_ready_or_changing": int(((data["ready_replicas"] != data["replicas"])
                                           | (data["replicas"] != data["replicas_set"])).sum()),
    }
    return data, data[keep].reset_index(drop=True), reasons


def params_for():
    """The transform's constants: the NFRs and their safe levels (nfr_metrics), nothing learned from the data."""
    return {"safe_p95": nfr.SAFE_P95, "nfr_p95": nfr.NFR_P95, "safe_errors": nfr.SAFE_ERRORS,
            "nfr_errors": nfr.NFR_ERRORS, "pod_separation": hm.POD_SEPARATION}


def fit(params, rows, gamma):
    return OneClassSVM(kernel="rbf", nu=NU, gamma=gamma).fit(hm.transform(params, rows))


def bands_of(health):
    return {int(r): (float(g["rps_per_pod"].min()), float(g["rps_per_pod"].max()), float(g["latency_p95"].median()),
                     float(g["latency_p95"].quantile(0.9)))
            for r, g in health.groupby("replicas")}


def build_probes(health, floor):
    """The 40 probes of A28, from the measured bands (rps per pod)."""
    bands, probes = bands_of(health), []

    def probe(label, replicas, rps_per_pod, anomaly, p95, err=0.0):
        probes.append({"label": label, "replicas": float(replicas), "throughput": rps_per_pod * replicas,
                       "rps_per_pod": rps_per_pod, "latency_p95": p95, "error_rate": err, "expect_anomaly": anomaly})

    counts = sorted(bands)
    for r in counts:
        lo, hi, med, top = bands[r]
        mid = (lo + hi) / 2
        probe(f"{r}p HEALTHY mid-band", r, mid, False, med)
        probe(f"{r}p HEALTHY top-band p95 {top:.2f}s", r, 0.95 * hi, False, top)
        for where, x in (("low", 1.05 * lo), ("mid", mid), ("top", 0.95 * hi)):
            probe(f"{r}p FAST {where}-band (p95 at the floor)", r, x, False, floor)
            probe(f"{r}p NFR p95 {nfr.NFR_P95:g}s {where}-band", r, x, True, nfr.NFR_P95)
        probe(f"{r}p NFR {100 * nfr.NFR_ERRORS:g}% errors", r, mid, True, med, err=nfr.NFR_ERRORS)
        probe(f"{r}p ABOVE the band ({ABOVE}x top)", r, ABOVE * hi, True, med)
        if r > counts[0]:
            probe(f"{r}p WASTE ({WASTE}x bottom)", r, WASTE * lo, True, med)
            probe(f"{r - 1}p AFTER scale-down", r - 1, WASTE * lo * r / (r - 1), False, bands[r - 1][2])
        probe(f"{r}p STUCK p95 3s", r, mid, True, 3.0)
        probe(f"{r}p OUTAGE 100% 5xx", r, mid, True, 0.02, err=1.0)
    return probes


def probe_failures(bundle, probes):
    d = hm.decision(bundle, probes)
    return [(p["label"], float(s)) for p, s in zip(probes, d) if (s < 0) != p["expect_anomaly"]], d


def noise(values_by_ramp):
    """95th percentile of the change between consecutive readings of the same ramp."""
    deltas = [np.abs(np.diff(v, axis=0)) for v in values_by_ramp if len(v) > 1]
    flat = np.concatenate([d if d.ndim == 1 else np.linalg.norm(d, axis=1) for d in deltas])
    return float(np.percentile(flat, 95))


def ramps(health):
    return [g for _, g in health.groupby(["replicas", "direction"])]


def monotonicity(bundle, health, eps):
    """(violations of (a): anomalous -> healthy as the latency rises, largest rise of the score on the anomalous side
    as the latency rises (b)) over a grid of loads and latencies per pod count."""
    flips, worst = 0, 0.0
    p95s = np.geomspace(bundle["params"]["safe_p95"], 1.0, 30)
    for r, (lo, hi, _, _) in bands_of(health).items():
        for load in np.geomspace(0.5 * lo * r, 1.3 * hi * r, 20):
            rows = [{"throughput": load, "latency_p95": p, "error_rate": 0.0, "replicas": float(r)} for p in p95s]
            s = hm.scores(bundle, rows)
            neg = s < 0
            first_neg = np.argmax(neg) if neg.any() else len(s)
            flips += int((~neg[first_neg:]).sum())
            both = neg[1:] & neg[:-1]
            if both.any():
                worst = max(worst, float(np.max(np.diff(s)[both])))
    return flips, worst, worst <= eps and flips == 0


def runs_of(flags, n=STREAK_REQUIRED):
    runs, streak = 0, 0
    for flag in flags:
        streak = streak + 1 if flag else 0
        runs += streak == n
    return runs


def held_out(params, health, gamma):
    flagged = total = wakes = 0
    up, down = health[health["direction"] == "up"], health[health["direction"] == "down"]
    for train, test in ((up, down), (down, up)):
        if len(train) < 20 or not len(test):
            continue
        model = fit(params, train, gamma)
        for _, group in test.groupby("replicas"):
            flags = model.predict(hm.transform(params, group)) == -1
            flagged += int(flags.sum())
            total += len(flags)
            wakes += runs_of(flags)
    return flagged, total, wakes


def make_bundle(params, model, gamma, health):
    bundle = {"model_type": hm.MODEL_TYPE, "features": hm.FEATURES, "params": params, "model": model, "gamma": gamma,
              "nu": NU, "bands": {}}
    d = hm.decision(bundle, health)
    pos = d[d > 0]
    bundle["pos_ref_all"] = float(np.median(pos)) if len(pos) else 1.0
    bundle["pos_ref"] = {int(r): float(np.median(d[(health["replicas"] == r).values & (d > 0)]))
                         for r in health["replicas"].unique() if ((health["replicas"] == r).values & (d > 0)).any()}
    bundle["noise_eps"] = noise([hm.transform(params, g) for g in ramps(health)])
    bundle["decision_noise"] = noise([hm.decision(bundle, g) for g in ramps(health)])
    return bundle


def search(health, probes):
    results = []
    params = params_for()
    for gamma in GAMMAS:
        model = fit(params, health, gamma)
        bundle = make_bundle(params, model, gamma, health)
        failures, d = probe_failures(bundle, probes)
        flips, worst, mono_ok = monotonicity(bundle, health, bundle["noise_eps"])
        flagged, total, wakes = held_out(params, health, gamma)
        normal = [s for p, s in zip(probes, d) if not p["expect_anomaly"]]
        anomalous = [s for p, s in zip(probes, d) if p["expect_anomaly"]]
        margin = min(min(normal), -max(anomalous))
        results.append({"gamma": gamma, "probe_failures": len(failures), "failed": [f for f, _ in failures],
                        "monotone": mono_ok, "mono_flips": flips, "mono_worst_rise": round(worst, 4),
                        "noise_eps": round(bundle["noise_eps"], 4), "support_vectors": len(model.support_),
                        "held_out_flagged": flagged, "held_out_total": total, "held_out_wakes": wakes,
                        "margin_over_noise": round(margin / bundle["decision_noise"], 3)})
    # The selection rule of A28 (kept in A30): every probe passes; monotone in latency; the fewest held-out wake-ups;
    # the largest probe margin over the noise of the decision function; the fewest held-out flagged readings; ties:
    # the smaller gamma.
    results.sort(key=lambda r: (r["probe_failures"], not r["monotone"], r["held_out_wakes"], -r["margin_over_noise"],
                                r["held_out_flagged"], r["gamma"]))
    return results


def healthy_band(bundle, n):
    """The throughput range (rps) the model calls healthy for n pods, latency and errors at the safe level."""
    grid = np.geomspace(1.0, 600.0, 1200)
    d = hm.decision(bundle, [{"throughput": t, "latency_p95": 0.0, "error_rate": 0.0, "replicas": float(n)}
                             for t in grid])
    ok = grid[d >= 0]
    return [round(float(ok.min()), 1), round(float(ok.max()), 1)] if len(ok) else None


def main():
    data, health, reasons = load_healthy()
    health.to_csv(OUTPUT_CSV, index=False)
    print(f"{len(data)} readings, {len(health)} healthy (p95 <= {nfr.SAFE_P95} s, errors <= "
          f"{100 * nfr.SAFE_ERRORS:g}%); rejected: {reasons}")
    print(health.groupby("replicas")[["rps_per_pod", "throughput", "latency_p95"]]
          .agg(["min", "median", "max"]).round(3).to_string())
    probes = build_probes(health, nfr.SAFE_P95)
    results = search(health, probes)
    print(f"\n--- {len(results)} values of gamma, in the order of the selection rule (A28, A30) ---")
    for r in results:
        print(f"  gamma {r['gamma']:<4} probe failures {r['probe_failures']} {r['failed'][:2]} monotone {r['monotone']} "
              f"(flips {r['mono_flips']}, rise {r['mono_worst_rise']} vs eps {r['noise_eps']}) held-out "
              f"{r['held_out_flagged']}/{r['held_out_total']}, {r['held_out_wakes']} wake-up(s), "
              f"margin/noise {r['margin_over_noise']}")
    best = results[0]

    params = params_for()
    model = fit(params, health, best["gamma"])
    bundle = make_bundle(params, model, best["gamma"], health)
    bundle["bands"] = {int(n): healthy_band(bundle, int(n)) for n in sorted(health["replicas"].unique())}
    # Memory: "similar" = closer than the model's own separation of a healthy state from an early overload of the
    # same pod count (the median distance HEALTHY mid-band -> ABOVE over the counts), instead of v9's fixed 1.5.
    pairs = [(p, q) for p in probes if "HEALTHY mid" in p["label"]
             for q in probes if "ABOVE" in q["label"] and q["replicas"] == p["replicas"]]
    bundle["memory_similar_max"] = float(np.median([np.linalg.norm(np.diff(hm.transform(params, [p, q]), axis=0))
                                                    for p, q in pairs]))
    bundle.update(trained_at=datetime.now().isoformat(timespec="seconds"), n_train=len(health))
    joblib.dump(bundle, MODEL_FILE)

    failures, d = probe_failures(bundle, probes)
    s = hm.scores(bundle, probes)
    print(f"\nChosen: gamma {best['gamma']}; {len(model.support_)} support vectors")
    print("--- Probes (score: 0..1 healthy, below 0 = distance from healthy) ---")
    for p, sc in zip(probes, s):
        ok = (sc < 0) == p["expect_anomaly"]
        print(f"  {'✅' if ok else '❌'} {p['label']:40s} {'ANOMALY' if sc < 0 else 'normal':7s} ({sc:+.2f})  "
              f"{p['throughput']:6.1f} rps  p95 {p['latency_p95']:.2f}  err {100 * p['error_rate']:.0f}%")
    flips, worst, mono_ok = monotonicity(bundle, health, bundle["noise_eps"])
    train_s = hm.scores(bundle, health)
    print(f"\nHealthy training readings below 0: {(train_s < 0).sum()}/{len(health)}; noise_eps {bundle['noise_eps']:.3f}; "
          f"bands (rps, latency and errors at the safe level): {bundle['bands']}; memory 'similar' within "
          f"{bundle['memory_similar_max']:.2f}")
    accept = {"all_probes_pass": not failures, "monotone_in_latency": mono_ok,
              f"held_out_wakes_<=_{MAX_HELD_OUT_WAKES}": best["held_out_wakes"] <= MAX_HELD_OUT_WAKES}
    print("ACCEPTANCE (A30, training part): " + ", ".join(f"{k} {'PASS' if v else 'FAIL'}" for k, v in accept.items()))

    REPORT_FILE.write_text(json.dumps({
        "chosen": best, "top": results[:10], "acceptance": accept, "noise_eps": bundle["noise_eps"],
        "decision_noise": bundle["decision_noise"], "params": params, "bands": bundle["bands"],
        "pos_ref": bundle["pos_ref"],
        "memory_similar_max": bundle["memory_similar_max"], "train_below_zero": int((train_s < 0).sum()),
        "n_train": len(health), "rejected": reasons,
        "monotonicity": {"flips": flips, "worst_rise": worst},
        "probes": [{"label": p["label"], "score": round(float(sc), 4), "decision": round(float(dd), 5),
                    "expect_anomaly": p["expect_anomaly"]} for p, sc, dd in zip(probes, s, d)]}, indent=2))
    print(f"Model -> {MODEL_FILE}; report -> {REPORT_FILE}")


if __name__ == "__main__":
    main()
