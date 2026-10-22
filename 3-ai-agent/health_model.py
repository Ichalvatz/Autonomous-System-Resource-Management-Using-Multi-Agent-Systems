"""
The health model of thesis phase 2 (2026-10-22): ONE One-Class SVM over the NFR metrics, with the replica count
as an input (design_decisions.md A24). Shared by the detector, the verification of an action, the incident
memory (its embedding space) and the training script, so they all see a reading the same way.

Inputs (nfr_metrics.py) and their transform (the parameters live in the bundle, written by
5-ml-training/train_health_baseline.py):
  rps_per_pod  log, standardized (mean/std of the training data). form "total" uses log(throughput) instead:
               kept for the offline comparison of the two forms.
  latency_p95  p95_weight * log(max(p95, p95_floor)): every p95 below the floor counts the same (histogram
               plateaus, as in phase 1), above it a fixed weight.
  error_rate   err_weight * error_rate: healthy data have no errors, so the weight sets how far 1% is.
  replicas     rep_weight * replicas: how far apart the healthy bands of neighbouring counts are kept.
The score is the SVM's decision_function: >= 0 normal, < 0 anomaly. Near the healthy boundary it moves a lot;
far away it flattens (RBF), so its direction (trend) is meaningful near the edge and its sign everywhere.
"""
import math

import joblib
import numpy as np

FEATURES = ["rps_per_pod", "latency_p95", "error_rate", "replicas"]


def load(path):
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or bundle.get("model_type") != "OneClassSVM-NFR":
        raise ValueError(f"{path} is not an NFR health model bundle (retrain with train_health_baseline.py)")
    return bundle


def transform(params, readings):
    """readings: a dict, a list of dicts or a DataFrame with the FEATURES (+ throughput for form "total")."""
    if isinstance(readings, dict):
        readings = [readings]
    rows = readings.to_dict("records") if hasattr(readings, "to_dict") else readings
    out = np.empty((len(rows), 4))
    for i, r in enumerate(rows):
        load_value = r["throughput"] if params.get("form") == "total" else r["rps_per_pod"]
        out[i, 0] = (math.log(max(load_value, 0.01)) - params["load_mean"]) / params["load_std"]
        out[i, 1] = params["p95_weight"] * math.log(max(r["latency_p95"], params["p95_floor"]))
        out[i, 2] = params["err_weight"] * max(r.get("error_rate") or 0.0, 0.0)
        out[i, 3] = params["rep_weight"] * r["replicas"]
    return out


def score(bundle, reading):
    """decision_function of one reading: >= 0 normal, < 0 anomaly."""
    return float(bundle["model"].decision_function(transform(bundle["params"], reading))[0])


def embedding(bundle, reading):
    """The reading in the model's space (a list of 4 floats): the incident memory's embedding."""
    return [round(float(x), 5) for x in transform(bundle["params"], reading)[0]]


def explain(bundle, reading):
    """Which metrics are outside the healthy range seen in training for this replica count, in physical units.
    The physical reading of a negative score, for the agent, the logs and the memory."""
    n = int(round(reading["replicas"]))
    ranges = bundle["healthy_ranges"].get(n)
    if ranges is None:
        return [f"no healthy data for {n} pod(s): the model was trained on {sorted(bundle['healthy_ranges'])}"]
    out = []
    lo, hi = ranges["rps_per_pod"]
    rps = reading["rps_per_pod"]
    if rps > hi:
        out.append(f"load per pod {rps:.1f} rps is above the healthy maximum {hi:.1f} for {n} pod(s) (under-provisioned)")
    elif rps < lo:
        out.append(f"load per pod {rps:.1f} rps is below the healthy minimum {lo:.1f} for {n} pod(s) (over-provisioned)")
    if reading["latency_p95"] > ranges["latency_p95"]:
        out.append(f"p95 latency {reading['latency_p95']:.2f} s is above the healthy maximum {ranges['latency_p95']:.2f} s")
    err = reading.get("error_rate") or 0.0
    if err > ranges["error_rate"]:
        out.append(f"{100 * err:.1f}% of requests fail (5xx); healthy maximum {100 * ranges['error_rate']:.1f}%")
    return out or ["every metric is inside its healthy range for this pod count; only their combination is unusual"]


def judge_trajectory(scores, pre_score, eps, window_full_at, consecutive_normal=2, stuck_readings=3):
    """Verdict on the score readings taken every 10 s after an action's rollout converged (oldest first).

    window_full_at: index of the first reading whose 1 m rate windows hold only post-action data; before it a
    rising score may still be the old data leaving the window, so only STABLE or WAIT are possible.
    Returns "STABLE", "WAIT" or "UNSTABLE: <reason>":
      STABLE    the last `consecutive_normal` scores are >= 0 (normal);
      UNSTABLE  worse than before the action (score < pre_score - eps), or not improving: the score has not
                risen by more than eps over the last `stuck_readings` readings while still anomalous;
      WAIT      anomalous but improving (or too early to tell).
    eps is the noise of the score between consecutive healthy readings (calibrated in training).
    """
    if len(scores) >= consecutive_normal and all(s >= 0 for s in scores[-consecutive_normal:]):
        return "STABLE"
    post = scores[window_full_at:]
    if not post or scores[-1] >= 0:
        return "WAIT"
    if post[-1] < pre_score - eps:
        return f"UNSTABLE: worse than before the action (score {post[-1]:+.2f} < {pre_score:+.2f})"
    if len(post) > stuck_readings and post[-1] - post[-1 - stuck_readings] <= eps:
        return (f"UNSTABLE: not improving (score {post[-1 - stuck_readings]:+.2f} -> {post[-1]:+.2f} "
                f"over the last {stuck_readings * 10} s)")
    return "WAIT"
