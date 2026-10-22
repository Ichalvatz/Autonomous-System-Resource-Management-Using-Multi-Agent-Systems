#!/usr/bin/env python3
"""
Health model, phase 2 (2026-10-22): ONE One-Class SVM on the NFR metrics with the replica count as an input
(design_decisions.md A24). Replaces the per-replica models on CPU / throttling of phase 1 (5-ml-training/phase1/).

Input: baseline_metrics_healthy.csv (collect_healthy_data.py). Kept as healthy: p95 < SLO_P95 (the objective;
the model must never learn a violation as normal), errors <= MAX_ERR, traffic >= MIN_RPS (the detector's gate),
and every pod ready (a reading during a pod change mixes two states).

The transform and the score live in 3-ai-agent/health_model.py (shared with the detector, the verification and
the memory). Its weights are chosen here by a small grid search, judged by
  1. probes derived from the measured bands (the situations the detector must get right; all must pass),
  2. held-out false alarms: train on the ramp-up readings, score the ramp-down ones, and back (pessimistic),
for both forms of the load input: rps per pod (the default) and total throughput (the comparison asked for).
Also calibrates trend_eps, the score noise between consecutive healthy readings, for the verification.

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

INPUT_CSV = HERE / "baseline_metrics_healthy.csv"
OUTPUT_CSV = HERE / "baseline_metrics_healthy_filtered.csv"
MODEL_FILE = HERE / "health_model.pkl"
REPORT_FILE = HERE / "training_report.json"

SLO_P95 = 0.35
MAX_ERR = 0.001
MIN_RPS = 1.0            # = anomaly_detector.MIN_THROUGHPUT_RPS
NU = 0.02
P95_FLOOR, P95_WEIGHT = 0.2, 4.0       # as in phase 1
WASTE_FACTOR = 0.8
STREAK_REQUIRED = 3
GRID = {"gamma": [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0], "rep_weight": [2.0, 4.0, 8.0, 12.0],
        "err_weight": [100.0, 300.0, 1000.0]}
SMOOTH = 3               # the verification judges a 30 s moving average of the score (health_model.judge_trajectory)


def load_healthy():
    data = pd.read_csv(INPUT_CSV)
    keep = ((data["latency_p95"] < SLO_P95) & (data["error_rate"] <= MAX_ERR) & (data["throughput"] >= MIN_RPS)
            & (data["ready_replicas"] == data["replicas"]) & (data["replicas"] == data["replicas_set"]))
    reasons = {
        "slo_violation": int((data["latency_p95"] >= SLO_P95).sum()),
        "errors": int((data["error_rate"] > MAX_ERR).sum()),
        "low_traffic": int((data["throughput"] < MIN_RPS).sum()),
        "pods_not_ready_or_changing": int(((data["ready_replicas"] != data["replicas"])
                                           | (data["replicas"] != data["replicas_set"])).sum()),
    }
    return data, data[keep].reset_index(drop=True), reasons


def params_for(health, form, rep_weight, err_weight):
    load = np.log(np.maximum(health["throughput" if form == "total" else "rps_per_pod"], 0.01))
    return {"form": form, "load_mean": float(load.mean()), "load_std": float(load.std()) or 1.0,
            "p95_floor": P95_FLOOR, "p95_weight": P95_WEIGHT, "err_weight": err_weight, "rep_weight": rep_weight}


def fit(params, rows, gamma):
    return OneClassSVM(kernel="rbf", nu=NU, gamma=gamma).fit(hm.transform(params, rows))


def build_probes(health):
    """The situations the detector must get right, from the measured bands (per pod: rps per pod)."""
    lat = float(health["latency_p95"].median())
    probes = []

    def probe(label, replicas, rps_per_pod, anomaly, p95=lat, err=0.0):
        probes.append({"label": label, "replicas": replicas, "rps_per_pod": rps_per_pod,
                       "throughput": rps_per_pod * replicas, "latency_p95": p95, "error_rate": err,
                       "expect_anomaly": anomaly})

    counts = sorted(health["replicas"].unique())
    for r in counts:
        band = health.loc[health["replicas"] == r, "rps_per_pod"]
        lo, hi = float(band.min()), float(band.max())
        mid = (lo + hi) / 2
        top_p95 = float(health.loc[health["replicas"] == r, "latency_p95"].quantile(0.9))
        probe(f"{r}p HEALTHY mid-band", r, mid, False)
        probe(f"{r}p HEALTHY top-band p95 {top_p95:.2f}s", r, hi * 0.95, False, p95=top_p95)
        if r > counts[0]:
            probe(f"{r}p WASTE", r, WASTE_FACTOR * lo, True)
            probe(f"{r - 1}p AFTER scale-down", r - 1, WASTE_FACTOR * lo * r / (r - 1), False)
        probe(f"{r}p EARLY OVERLOAD (load only)", r, 1.2 * hi, True)
        probe(f"{r}p OVERLOAD p95 0.4s", r, 1.15 * hi, True, p95=0.4)
        probe(f"{r}p SLOW p95 0.4s", r, mid, True, p95=0.4)
        probe(f"{r}p STUCK p95 3s", r, mid, True, p95=3.0)
        probe(f"{r}p ERRORS 1%", r, mid, True, err=0.01)
        probe(f"{r}p OUTAGE 100% 5xx", r, mid, True, p95=0.01, err=1.0)
    low = health[(health["replicas"] == counts[0]) & (health["throughput"] < 3)]
    if len(low):
        probe(f"{counts[0]}p LOW traffic", counts[0], float(low["rps_per_pod"].median()), False,
              p95=float(low["latency_p95"].quantile(0.9)))
    return probes


def probe_failures(params, model, probes):
    scores = model.decision_function(hm.transform(params, probes))
    return [(p["label"], float(s)) for p, s in zip(probes, scores) if (s < 0) != p["expect_anomaly"]], scores


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


def trend_eps(params, model, health, smooth=SMOOTH):
    """95th percentile of |change| between consecutive healthy readings of the same ramp: of the score's moving
    average over `smooth` readings (what the verification judges), or of single readings (smooth=1)."""
    deltas = []
    for _, group in health.groupby(["replicas", "direction"]):
        scores = list(model.decision_function(hm.transform(params, group)))
        deltas += list(np.abs(np.diff(hm.moving_average(scores, smooth))))
    return float(np.percentile(deltas, 95)) if deltas else 0.05


def search(health, probes, form):
    results = []
    for gamma, rep_weight, err_weight in itertools.product(GRID["gamma"], GRID["rep_weight"], GRID["err_weight"]):
        params = params_for(health, form, rep_weight, err_weight)
        model = fit(params, health, gamma)
        failures, scores = probe_failures(params, model, probes)
        flagged, total, wakes = held_out(params, health, gamma)
        normal = [s for p, s in zip(probes, scores) if not p["expect_anomaly"]]
        anomalous = [s for p, s in zip(probes, scores) if p["expect_anomaly"]]
        margin = min(min(normal), -max(anomalous))
        results.append({"form": form, "gamma": gamma, "rep_weight": rep_weight, "err_weight": err_weight,
                        "probe_failures": len(failures), "failed": [f for f, _ in failures],
                        "held_out_flagged": flagged, "held_out_total": total, "held_out_wakes": wakes,
                        "margin_over_noise": round(margin / trend_eps(params, model, health), 2)})
    # Pre-declared order (2026-10-23, before choosing; design_decisions.md A26): every probe passes; the fewest
    # held-out wake-ups (false wake-ups are what costs); the largest probe margin over the noise of the score's
    # 30 s average (the verification judges the score's trajectory, so it must stand out of its noise); the fewest
    # held-out flagged readings; ties: phase 1's gamma, then lighter weights.
    results.sort(key=lambda r: (r["probe_failures"], r["held_out_wakes"], -r["margin_over_noise"],
                                r["held_out_flagged"], abs(math.log(r["gamma"] / 0.02)), r["rep_weight"],
                                r["err_weight"]))
    return results


def main():
    data, health, reasons = load_healthy()
    health.to_csv(OUTPUT_CSV, index=False)
    print(f"{len(data)} readings, {len(health)} healthy; rejected: {reasons}")
    print(health.groupby("replicas")[["rps_per_pod", "throughput", "latency_p95", "error_rate"]]
          .agg(["min", "median", "max"]).round(3).to_string())
    probes = build_probes(health)

    report = {}
    for form in ("per_pod", "total"):
        results = search(health, probes, form)
        report[form] = results[:5]
        print(f"\n--- form {form}: best of {len(results)} configurations ---")
        for r in results[:5]:
            print(f"  gamma {r['gamma']:<6} rep_w {r['rep_weight']:<5} err_w {r['err_weight']:<7} "
                  f"probe failures {r['probe_failures']} {r['failed'][:3]}  held-out "
                  f"{r['held_out_flagged']}/{r['held_out_total']} flagged, {r['held_out_wakes']} wake-up(s), "
                  f"margin/noise {r['margin_over_noise']}")
    best_pp, best_tot = report["per_pod"][0], report["total"][0]
    key = lambda r: (r["probe_failures"], r["held_out_wakes"], -r["margin_over_noise"], r["held_out_flagged"])
    best = best_tot if key(best_tot) < key(best_pp) else best_pp   # per pod unless the total form is strictly better
    print(f"\nChosen: form {best['form']} (per pod {key(best_pp)} vs total {key(best_tot)}: "
          f"probe failures, held-out wake-ups, -margin/noise, held-out flagged)")

    params = params_for(health, best["form"], best["rep_weight"], best["err_weight"])
    model = fit(params, health, best["gamma"])
    failures, scores = probe_failures(params, model, probes)
    print("--- Probes ---")
    for p, s in zip(probes, scores):
        ok = (s < 0) == p["expect_anomaly"]
        print(f"  {'✅' if ok else '❌'} {p['label']:38s} {'ANOMALY' if s < 0 else 'normal':7s} ({s:+.3f})  "
              f"rps/pod {p['rps_per_pod']:.1f}  p95 {p['latency_p95']:.2f}  err {100 * p['error_rate']:.0f}%")
    train_scores = model.decision_function(hm.transform(params, health))
    eps = trend_eps(params, model, health)
    eps_single = trend_eps(params, model, health, smooth=1)
    ranges = {int(r): {"rps_per_pod": [float(g["rps_per_pod"].min()), float(g["rps_per_pod"].max())],
                       "latency_p95": float(g["latency_p95"].max()),
                       "error_rate": max(float(g["error_rate"].max()), MAX_ERR)}
              for r, g in health.groupby("replicas")}
    bundle = {"model_type": "OneClassSVM-NFR", "features": hm.FEATURES, "params": params, "model": model,
              "nu": NU, "gamma": best["gamma"], "healthy_ranges": ranges, "trend_eps": eps,
              "noise_eps_single": eps_single, "smooth": SMOOTH,
              "trained_at": datetime.now().isoformat(timespec="seconds"), "n_train": len(health)}
    joblib.dump(bundle, MODEL_FILE)
    report.update({"chosen": best, "trend_eps": eps, "noise_eps_single": eps_single, "healthy_ranges": ranges,
                   "train_flagged": int((train_scores < 0).sum()), "n_train": len(health), "rejected": reasons,
                   "probes": [{"label": p["label"], "score": round(float(s), 4), "expect_anomaly": p["expect_anomaly"]}
                              for p, s in zip(probes, scores)]})
    REPORT_FILE.write_text(json.dumps(report, indent=2))
    print(f"\nTraining data flagged: {(train_scores < 0).sum()}/{len(health)}; trend eps (95th pct of |Δ| of the "
          f"{SMOOTH}-reading average): {eps:.4f} (single readings: {eps_single:.4f})\n"
          f"Healthy ranges: {json.dumps(ranges)}\nModel -> {MODEL_FILE}; report -> {REPORT_FILE}")
    if failures:
        print(f"⚠️  {len(failures)} probe(s) failed: {failures}")


if __name__ == "__main__":
    main()
