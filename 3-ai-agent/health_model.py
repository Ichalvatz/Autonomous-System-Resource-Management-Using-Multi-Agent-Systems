"""
The health model of thesis phase 2 (2026-10-22): ONE One-Class SVM over the NFR metrics, with the replica count
as an input (design_decisions.md A24). Shared by the detector, the verification of an action, the incident
memory (its embedding space) and the training script, so they all see a reading the same way.

Inputs (nfr_metrics.py) and their transform (the parameters live in the bundle, written by
5-ml-training/train_health_baseline.py):
  load         form "per_pod": log(rps per pod); form "total": log(throughput). Either standardized (mean/std of
               the training data). The bundle says which; the selection rule chose "total" (design_decisions.md A26).
  latency_p95  p95_weight * log(max(p95, p95_floor)): every p95 below the floor counts the same (histogram
               plateaus, as in phase 1), above it a fixed weight.
  error_rate   err_weight * error_rate: healthy data have no errors, so the weight sets how far 1% is.
  replicas     rep_weight * replicas: how far apart the healthy bands of neighbouring counts are kept.
The score is the SVM's decision_function: >= 0 normal, < 0 anomaly. Near the healthy boundary it moves a lot;
far away it flattens (RBF), so its direction (trend) is meaningful near the edge and its sign everywhere. One
reading's score is noisy (a healthy state sits only ~0.01 above 0, about the change between two readings), so
the trajectory is judged on a 30 s moving average (judge_trajectory).
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


def moving_average(scores, n=3):
    """Mean of each score with up to n-1 before it: one reading is noisy (p95 bucket plateaus, rate windows);
    the trajectory is judged on this."""
    return [sum(scores[max(0, i - n + 1):i + 1]) / len(scores[max(0, i - n + 1):i + 1]) for i in range(len(scores))]


def judge_trajectory(scores, pre_score, eps, window_full_at, stuck_readings=3, smooth=3):
    """Verdict on the score readings taken every 10 s after an action's rollout converged (oldest first).

    The scores are judged on their moving average over `smooth` readings (30 s): measured on the training data,
    the change between two single readings is as large as the margin of a healthy state above 0, so one
    reading cannot say "better" or "worse" (design_decisions.md A26). eps is the noise of that moving average
    between consecutive healthy readings (95th percentile, calibrated in training).
    window_full_at: index of the first reading whose 1 m rate windows hold only post-action data. Before it a
    rising score may still be the old data leaving the window, so only STABLE or WAIT are possible; after it the
    average is taken over post-action readings only (smoke run 2026-10-23 06:32: an average that still held two
    pre-action readings called a scale-up that had just worked "worse than before"), and a failure needs a full
    post-action average (`smooth` readings).
    Returns "STABLE", "WAIT" or "UNSTABLE: <reason>":
      STABLE    the average is >= 0 and at least 2 of the last 3 readings are normal;
      UNSTABLE  worse than before the action (average < pre_score - eps), or not improving: the average has not
                risen by more than eps over the last `stuck_readings` readings while still anomalous;
      WAIT      anomalous but improving, near the boundary, or too early to tell.
    """
    post = scores[window_full_at:]
    ma = moving_average(post if post else scores, smooth)
    last3 = scores[-3:]
    if ma[-1] >= 0 and len(scores) >= 2 and sum(s >= 0 for s in last3) >= min(2, len(last3)):
        return "STABLE"
    if len(post) < smooth or ma[-1] >= -eps:
        return "WAIT"
    full = ma[smooth - 1:]          # averages made of post-action readings only
    if full[-1] < pre_score - eps:
        return f"UNSTABLE: worse than before the action (score {full[-1]:+.3f} < {pre_score:+.3f}, 30 s average)"
    if len(full) > stuck_readings and full[-1] - full[-1 - stuck_readings] <= eps:
        return (f"UNSTABLE: not improving (score {full[-1 - stuck_readings]:+.3f} -> {full[-1]:+.3f} "
                f"over the last {stuck_readings * 10} s, 30 s average)")
    return "WAIT"
