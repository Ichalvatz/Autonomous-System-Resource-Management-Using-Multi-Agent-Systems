#!/usr/bin/env python3
"""
Health model, agent v12 (2026-11-01, design_decisions.md A31; v11 A30, v10 A28 / A28.1): ONE One-Class SVM on the NFR
metrics (load, latency, errors, pod count) that alone decides at run time, with the NFRs (3-ai-agent/nfr_metrics.py)
built into the data, the input units and the acceptance tests. v12 keeps v11's model and changes how it is tested: the
probes are ranges that cover every case instead of 40 points (v11's points missed a hole in the 1-pod band at 18 rps),
and the data hold the 1-pod low end (1-4 rps).

Input: baseline_metrics_healthy.csv (collect_healthy_data.py): the ramps of 2026-10-23 and the 1-pod low-end staircase
of 2026-11-01.
  1. Healthy = p95 <= SAFE_P95 (0.25 s, the safe level of the capacity table), errors <= SAFE_ERRORS, >= MIN_RPS, every
     pod ready.
  2. The inputs are in NFR units with no tuned weights (3-ai-agent/health_model.py): ln(throughput); latency and errors
     0 = the safe level, 1 = the objective, everything within the safe level the same; the pod counts far apart.
  3. Why a scan along the load covers every reading (A31): every healthy reading has latency and errors at 0, so every
     support vector sits on the load axis and, for N pods, the SVM's kernel sum is exp(-gamma * r^2) * K_N(ln rps),
     r = the distance above the safe level. Healthy <=> r^2 <= ln(K_N / rho) / gamma: the load band, the latency and
     errors tolerated at each load and the monotonicity all follow from K_N, one function of the load per pod count.
     The script checks that premise and scans K_N densely (SCAN).
  4. The only choice is gamma (the grid of A28); each candidate judged by
       - the range probes of A31 (all must pass): healthy across each band, one healthy interval (no hole, no island),
         above / below the band, p95 = NFR_P95 and NFR_ERRORS at every load, after a scale-up / scale-down, idle 1 pod,
         the measured faults;
       - monotonicity in latency and in errors;
       - held-out false alarms: train on the "up" readings, score the "down" ones, and back;
     with the selection rule of A28 (kept in A30, A31).
  5. Prints the acceptance criteria of A31 that it can check (probes, monotonicity, held-out wake-ups <= 2, premise).

  python 5-ml-training/train_health_baseline.py            (seconds; read-only except the outputs)

Writes health_model.pkl (bundle, gitignored), baseline_metrics_healthy_filtered.csv and training_report.json.
"""
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
MAX_HELD_OUT_WAKES = 2   # v9's (A26): an acceptance criterion of A28, A30 and A31
ABOVE, WASTE, EDGE = 1.1, 0.8, 0.05   # probe positions relative to the band (A28)
# The load axis of the range probes (rps): step 0.25%, far below the narrowest feature of K_N (1/sqrt(2 gamma) >= 0.7
# in ln rps for gamma <= 1), so no hole or island can fall between two points (A31).
SCAN = np.geomspace(0.5, 1000.0, 3000)
IDLE_TOP = 4.0           # rps: the 1-pod low end the ramps of 2026-10-23 never showed (A31)
MEASURED_FAULTS = [      # (label, p95 s, error rate), probed at mid-band
    ("STUCK p95 3s", 3.0, 0.0),
    ("OUTAGE 100% 5xx", 0.02, 1.0),
    ("STUCK as measured 2026-10-28 (p95 4.6s, 48% 5xx)", 4.6, 0.48),
    ("CPUHOG (p95 0.7s, 0% 5xx)", 0.7, 0.0),
]


def load_healthy():
    data = pd.read_csv(INPUT_CSV)
    if "segment" not in data:
        data["segment"] = "ramp"
    data["segment"] = data["segment"].fillna("ramp")
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
    """{pods: (lowest, highest healthy throughput in the data, rps)}."""
    return {int(r): (float(g["throughput"].min()), float(g["throughput"].max())) for r, g in health.groupby("replicas")}


def rows_at(loads, n, p95=0.0, err=0.0):
    return [{"throughput": float(t), "latency_p95": p95, "error_rate": err, "replicas": float(n)} for t in loads]


def between(a, b):
    """The scan's loads from a to b (rps), both ends included."""
    return np.unique(np.r_[a, SCAN[(SCAN > a) & (SCAN < b)], b])


def intervals(bundle, n):
    """The healthy intervals (rps) of n pods along the scan, latency and errors at the safe level."""
    ok = hm.decision(bundle, rows_at(SCAN, n)) >= 0
    edges = np.flatnonzero(np.diff(np.r_[0, ok.astype(int), 0]))
    return [(float(SCAN[a]), float(SCAN[b - 1])) for a, b in zip(edges[::2], edges[1::2])]


def build_probes(bundle, health):
    """The range probes of A31 (the points of A28 are members of these ranges). Each probe: rows and the expectation;
    7 and 8 start where the model's own band of n pods ends, so they are built per model."""
    bands, counts, probes = bands_of(health), sorted(bands_of(health)), []
    found = {n: intervals(bundle, n) for n in counts}
    outer = {n: (iv[0][0], iv[-1][1]) if iv else (math.nan, math.nan) for n, iv in found.items()}

    def probe(no, label, n, loads, anomaly, p95=0.0, err=0.0):
        probes.append({"no": no, "label": label, "replicas": n, "rows": rows_at(loads, n, p95, err),
                       "expect_anomaly": anomaly})

    for n in counts:
        lo, hi = bands[n]
        probe(1, f"{n}p HEALTHY across the band {(1 + EDGE) * lo:.1f}-{(1 - EDGE) * hi:.1f} rps", n,
              between((1 + EDGE) * lo, (1 - EDGE) * hi), False)
        probes.append({"no": 2, "label": f"{n}p ONE healthy interval (no hole, no island)", "replicas": n,
                       "intervals": found[n]})
        probe(3, f"{n}p ABOVE the band (>= {ABOVE}x top, {ABOVE * hi:.1f} rps)", n, between(ABOVE * hi, SCAN[-1]), True)
        if n > counts[0]:
            probe(4, f"{n}p WASTE (<= {WASTE}x bottom, {WASTE * lo:.1f} rps)", n, between(SCAN[0], WASTE * lo), True)
        probe(5, f"{n}p NFR p95 {nfr.NFR_P95:g}s at every load", n, SCAN, True, p95=nfr.NFR_P95)
        probe(6, f"{n}p NFR {100 * nfr.NFR_ERRORS:g}% errors at every load", n, SCAN, True, err=nfr.NFR_ERRORS)
        if n < counts[-1]:
            top = min(outer[n][1], ABOVE * hi) if outer[n][1] == outer[n][1] else ABOVE * hi
            probe(7, f"{n + 1}p AFTER scale-up from {n} ({top:.1f}-{ABOVE * hi:.1f} rps)", n + 1,
                  between(top, ABOVE * hi), False)
        if n > counts[0]:
            bottom = max(outer[n][0], WASTE * lo) if outer[n][0] == outer[n][0] else WASTE * lo
            probe(8, f"{n - 1}p AFTER scale-down from {n} ({WASTE * lo:.1f}-{bottom:.1f} rps)", n - 1,
                  between(WASTE * lo, bottom), False)
        if n == counts[0]:
            probe(9, f"{n}p IDLE {(1 + EDGE) * MIN_RPS:.2f}-{IDLE_TOP:g} rps", n,
                  between((1 + EDGE) * MIN_RPS, IDLE_TOP), False)
        for label, p95, err in MEASURED_FAULTS:
            probe(10, f"{n}p {label}", n, [(lo + hi) / 2], True, p95=p95, err=err)
    return probes


def judge_probes(bundle, probes):
    """Per probe: passed, the worst point (rps) and its decision value (the one closest to the wrong answer)."""
    out = []
    for p in probes:
        if p["no"] == 2:
            out.append({**p, "passed": len(p["intervals"]) == 1, "worst_rps": None, "worst_d": None})
            continue
        d = hm.decision(bundle, p["rows"])
        k = int(np.argmax(d) if p["expect_anomaly"] else np.argmin(d))
        passed = bool(d[k] < 0) if p["expect_anomaly"] else bool(d[k] >= 0)
        out.append({**p, "passed": passed, "worst_rps": p["rows"][k]["throughput"], "worst_d": float(d[k]),
                    "worst_row": p["rows"][k]})
    return out


def noise(values_by_ramp):
    """95th percentile of the change between consecutive readings of the same ramp."""
    deltas = [np.abs(np.diff(v, axis=0)) for v in values_by_ramp if len(v) > 1]
    flat = np.concatenate([d if d.ndim == 1 else np.linalg.norm(d, axis=1) for d in deltas])
    return float(np.percentile(flat, 95))


def ramps(health):
    """The continuous ramps (the definition of noise_eps since A28; the low-end holds are steps, not ramps)."""
    ramp = health[health["segment"] == "ramp"]
    return [g for _, g in ramp.groupby(["replicas", "direction"])]


def monotonicity(bundle, health, eps):
    """(violations of (a): anomalous -> healthy as the latency or the errors rise, largest rise of the score on the
    anomalous side as they rise (b)) over a grid of loads, latencies and error rates per pod count."""
    flips, worst = 0, 0.0
    p95s = np.geomspace(bundle["params"]["safe_p95"], 1.0, 30)
    errs = np.geomspace(bundle["params"]["safe_errors"], 1.0, 30)
    for r, (lo, hi) in bands_of(health).items():
        for load in np.geomspace(0.5 * lo, 1.3 * hi, 20):
            for rows in ([{"throughput": load, "latency_p95": p, "error_rate": 0.0, "replicas": float(r)} for p in p95s],
                         [{"throughput": load, "latency_p95": 0.0, "error_rate": e, "replicas": float(r)} for e in errs]):
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
        for _, group in test.groupby(["replicas", "segment"]):
            flags = model.predict(hm.transform(params, group)) == -1
            flagged += int(flags.sum())
            total += len(flags)
            wakes += runs_of(flags)
    return flagged, total, wakes


def on_load_axis(model):
    """The premise of the scan (A31): every support vector at the safe level of latency and errors."""
    return bool(np.all(model.support_vectors_[:, 1:3] == 0.0))


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


def margin_of(judged):
    """The probe margin of A28 over the ranges: the worst decision value of the healthy probes and minus that of the
    anomalous ones, whichever is smaller."""
    normal = [j["worst_d"] for j in judged if j["no"] != 2 and not j["expect_anomaly"]]
    anomalous = [j["worst_d"] for j in judged if j["no"] != 2 and j["expect_anomaly"]]
    return min(min(normal), -max(anomalous))


def search(health):
    results = []
    params = params_for()
    for gamma in GAMMAS:
        model = fit(params, health, gamma)
        bundle = make_bundle(params, model, gamma, health)
        judged = judge_probes(bundle, build_probes(bundle, health))
        failed = [j["label"] for j in judged if not j["passed"]]
        flips, worst, mono_ok = monotonicity(bundle, health, bundle["noise_eps"])
        flagged, total, wakes = held_out(params, health, gamma)
        results.append({"gamma": gamma, "probe_failures": len(failed), "failed": failed, "probes": len(judged),
                        "intervals": {n: intervals(bundle, n) for n in sorted(bands_of(health))},
                        "monotone": mono_ok, "mono_flips": flips, "mono_worst_rise": round(worst, 4),
                        "on_load_axis": on_load_axis(model),
                        "noise_eps": round(bundle["noise_eps"], 4), "support_vectors": len(model.support_),
                        "held_out_flagged": flagged, "held_out_total": total, "held_out_wakes": wakes,
                        "margin_over_noise": round(margin_of(judged) / bundle["decision_noise"], 3)})
    # The selection rule of A28 (kept in A30, A31): every probe passes; monotone; the fewest held-out wake-ups; the
    # largest probe margin over the noise of the decision function; the fewest held-out flagged readings; ties: the
    # smaller gamma.
    results.sort(key=lambda r: (r["probe_failures"], not r["monotone"], r["held_out_wakes"], -r["margin_over_noise"],
                                r["held_out_flagged"], r["gamma"]))
    return results


def tolerance(bundle, n, loads):
    """How far above the safe level the model accepts at each load (A31): R = sqrt(ln(K_N / rho) / gamma), and what
    that is in p95 (latency alone) and in errors (errors alone). R < 1 everywhere = both NFRs anomalous at every load."""
    p, rho = bundle["params"], float(bundle["model"].offset_[0])
    k = hm.decision(bundle, rows_at(loads, n)) + rho
    r = np.sqrt(np.maximum(np.log(np.maximum(k, 1e-300) / rho), 0.0) / bundle["gamma"])
    return r, p["safe_p95"] * (p["nfr_p95"] / p["safe_p95"]) ** r, p["safe_errors"] + (p["nfr_errors"] - p["safe_errors"]) * r


def main():
    data, health, reasons = load_healthy()
    health.to_csv(OUTPUT_CSV, index=False)
    print(f"{len(data)} readings, {len(health)} healthy (p95 <= {nfr.SAFE_P95} s, errors <= "
          f"{100 * nfr.SAFE_ERRORS:g}%); rejected: {reasons}")
    print(health.groupby(["replicas", "segment"])[["throughput", "latency_p95"]]
          .agg(["count", "min", "median", "max"]).round(3).to_string())
    results = search(health)
    print(f"\n--- {len(results)} values of gamma, in the order of the selection rule (A28, A30, A31) ---")
    for r in results:
        holes = {n: len(iv) for n, iv in r["intervals"].items()}
        print(f"  gamma {r['gamma']:<4} probe failures {r['probe_failures']}/{r['probes']} {r['failed'][:3]} intervals "
              f"{holes} monotone {r['monotone']} (flips {r['mono_flips']}, rise {r['mono_worst_rise']} vs eps "
              f"{r['noise_eps']}) held-out {r['held_out_flagged']}/{r['held_out_total']}, {r['held_out_wakes']} "
              f"wake-up(s), margin/noise {r['margin_over_noise']}, SVs on the load axis {r['on_load_axis']}")
    best = results[0]

    params = params_for()
    model = fit(params, health, best["gamma"])
    bundle = make_bundle(params, model, best["gamma"], health)
    counts = sorted(bands_of(health))
    found = {n: intervals(bundle, n) for n in counts}
    bundle["bands"] = {n: [round(iv[0][0], 1), round(iv[-1][1], 1)] for n, iv in found.items() if iv}
    # Memory: "similar" = closer than the model's own separation of a healthy state from an early overload of the
    # same pod count (the median distance mid-band -> ABOVE over the counts), instead of v9's fixed 1.5.
    bands = bands_of(health)
    bundle["memory_similar_max"] = float(np.median([
        np.linalg.norm(np.diff(hm.transform(params, rows_at([(lo + hi) / 2, ABOVE * hi], n)), axis=0))
        for n, (lo, hi) in bands.items()]))
    bundle.update(trained_at=datetime.now().isoformat(timespec="seconds"), n_train=len(health))
    joblib.dump(bundle, MODEL_FILE)

    judged = judge_probes(bundle, build_probes(bundle, health))
    print(f"\nChosen: gamma {best['gamma']}; {len(model.support_)} support vectors; every support vector on the load "
          f"axis (the premise of the scan): {on_load_axis(model)}")
    print("--- Range probes (A31): the worst point of each range; score 0..1 healthy, below 0 = distance ---")
    for j in judged:
        if j["no"] == 2:
            ivs = ", ".join(f"{a:.1f}-{b:.1f}" for a, b in j["intervals"]) or "none"
            print(f"  {'✅' if j['passed'] else '❌'} {j['no']:>2}. {j['label']:62s} healthy at {ivs} rps")
            continue
        sc = hm.score(bundle, j["worst_row"])
        print(f"  {'✅' if j['passed'] else '❌'} {j['no']:>2}. {j['label']:62s} worst at {j['worst_rps']:7.1f} rps: "
              f"{'ANOMALY' if sc < 0 else 'normal':7s} ({sc:+.2f})")
    print("--- How far above the safe level the model accepts (latency alone / errors alone) ---")
    tol = {}
    for n in counts:
        lo, hi = bands[n]
        r, p95, err = tolerance(bundle, n, SCAN)
        k = int(np.argmax(r))
        edges = [x for x in ((1 + EDGE) * lo, (1 - EDGE) * hi)]
        re, pe, ee = tolerance(bundle, n, edges)
        tol[n] = {"max_r": round(float(r[k]), 3), "at_rps": round(float(SCAN[k]), 1), "max_p95": round(float(p95[k]), 3),
                  "max_errors": round(float(err[k]), 4), "edge_p95": [round(float(x), 3) for x in pe],
                  "edge_errors": [round(float(x), 4) for x in ee]}
        print(f"  {n} pod(s): widest at {SCAN[k]:.1f} rps: p95 up to {p95[k]:.3f} s or errors up to {100 * err[k]:.2f}% "
              f"(R {r[k]:.2f} < 1); at the band edges {edges[0]:.1f} / {edges[1]:.1f} rps: p95 {pe[0]:.3f} / {pe[1]:.3f} s, "
              f"errors {100 * ee[0]:.2f}% / {100 * ee[1]:.2f}%")
    flips, worst, mono_ok = monotonicity(bundle, health, bundle["noise_eps"])
    train_s = hm.scores(bundle, health)
    overlap = {f"{n}-{n + 1}": [bundle["bands"][n + 1][0], bundle["bands"][n][1]] for n in counts[:-1]}
    print(f"\nHealthy training readings below 0: {(train_s < 0).sum()}/{len(health)}; noise_eps {bundle['noise_eps']:.3f}; "
          f"bands (rps, latency and errors at the safe level): {bundle['bands']}; deadbands {overlap}; memory "
          f"'similar' within {bundle['memory_similar_max']:.2f}")
    failed = [j["label"] for j in judged if not j["passed"]]
    accept = {"all_probes_pass": not failed, "monotone_in_latency_and_errors": mono_ok,
              f"held_out_wakes_<=_{MAX_HELD_OUT_WAKES}": best["held_out_wakes"] <= MAX_HELD_OUT_WAKES,
              "support_vectors_on_the_load_axis": on_load_axis(model)}
    print("ACCEPTANCE (A31, training part): " + ", ".join(f"{k} {'PASS' if v else 'FAIL'}" for k, v in accept.items()))

    REPORT_FILE.write_text(json.dumps({
        "chosen": best, "candidates": results, "acceptance": accept, "noise_eps": bundle["noise_eps"],
        "decision_noise": bundle["decision_noise"], "params": params, "bands": bundle["bands"], "deadbands": overlap,
        "pos_ref": bundle["pos_ref"], "tolerance": tol,
        "memory_similar_max": bundle["memory_similar_max"], "train_below_zero": int((train_s < 0).sum()),
        "n_train": len(health), "n_train_by_segment": health["segment"].value_counts().to_dict(), "rejected": reasons,
        "monotonicity": {"flips": flips, "worst_rise": worst},
        "probes": [{"no": j["no"], "label": j["label"], "passed": j["passed"],
                    **({"intervals": j["intervals"]} if j["no"] == 2 else
                       {"worst_rps": round(j["worst_rps"], 2), "worst_decision": round(j["worst_d"], 5),
                        "worst_score": round(hm.score(bundle, j["worst_row"]), 4),
                        "expect_anomaly": j["expect_anomaly"]})} for j in judged]}, indent=2))
    print(f"Model -> {MODEL_FILE}; report -> {REPORT_FILE}")


if __name__ == "__main__":
    main()
