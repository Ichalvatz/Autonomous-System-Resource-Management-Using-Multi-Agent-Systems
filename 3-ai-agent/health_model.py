"""
The health model of agent v10 (thesis phase 2, 2026-10-26; design_decisions.md A28): ONE One-Class SVM over the NFR
metrics (load, latency, errors, pod count) that alone decides at run time. The NFRs (nfr_metrics.py) are built into
the model instead of rules around it:
  - healthy training data = the readings within the safe level (p95 <= SAFE_P95, errors <= SAFE_ERRORS;
    5-ml-training/train_health_baseline.py);
  - the inputs are in NFR units (transform), and every p95 at or below the safe level counts the same, so a faster
    state is never judged worse (A28.1: a model that also learned "normal latency for this load" below it was not
    monotone at the edges of the bands and failed its acceptance tests);
  - the acceptance probes require p95 = NFR_P95 and NFR_ERRORS of errors to be anomalies at every pod count.
Shared by the detector, the verification of an action, the incident memory (its embedding space), the agent's facts
(the minimum pod count) and the training script, so they all see a reading the same way.

Inputs (weights from the training grid, in the bundle):
  x0 = w_load * (log(throughput) - mean) / std
  x1 = w_lat  * log(max(p95, floor) / NFR_P95)     floor = SAFE_P95; 0 = at the objective
  x2 = w_err  * error_rate / NFR_ERRORS            1 = at the objective
  x3 = w_rep  * replicas
The score is the SVM's own decision function d = sum_i a_i * exp(-gamma * |x - x_i|^2) - rho, read as a distance:
  d >= 0: min(1, d / d_ref), d_ref = the median d of the healthy readings of this pod count: 1 = typically healthy;
  d <  0: -sqrt(log(rho / sum) / gamma), the log of the kernel sum: the distance from the healthy region in the units
          of x. Same boundary as the SVM; unlike d itself it does not flatten far away (v9's -0.537 for every fault),
          so a trajectory shows how far the state is and whether it moves back.
"""
import math

import joblib
import numpy as np
from scipy.special import logsumexp

FEATURES = ["throughput", "latency_p95", "error_rate", "replicas"]
MODEL_TYPE = "OneClassSVM-NFR-v10"


def load(path):
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or bundle.get("model_type") != MODEL_TYPE:
        raise ValueError(f"{path} is not a v10 health model bundle (retrain with train_health_baseline.py)")
    return bundle


def _rows(readings):
    if isinstance(readings, dict):
        return [readings]
    return readings.to_dict("records") if hasattr(readings, "to_dict") else readings


def transform(params, readings):
    """readings: a dict, a list of dicts or a DataFrame with throughput, latency_p95, error_rate, replicas."""
    rows = _rows(readings)
    out = np.empty((len(rows), 4))
    for i, r in enumerate(rows):
        out[i, 0] = params["w_load"] * (math.log(max(r["throughput"], 0.01)) - params["load_mean"]) / params["load_std"]
        out[i, 1] = params["w_lat"] * math.log(max(r["latency_p95"], params["p95_floor"]) / params["nfr_p95"])
        out[i, 2] = params["w_err"] * max(r.get("error_rate") or 0.0, 0.0) / params["nfr_errors"]
        out[i, 3] = params["w_rep"] * r["replicas"]
    return out


def decision(bundle, readings):
    """The SVM's decision_function (>= 0 normal) of each reading."""
    return bundle["model"].decision_function(transform(bundle["params"], readings))


def _log_kernel_sum(model, x):
    d2 = ((x[:, None, :] - model.support_vectors_[None]) ** 2).sum(-1)
    return logsumexp(np.log(model.dual_coef_[0])[None] - model._gamma * d2, axis=1)


def scores(bundle, readings):
    """The score of each reading: 0..1 when healthy (1 = typical), minus the distance from healthy when not."""
    model, rows = bundle["model"], _rows(readings)
    x = transform(bundle["params"], rows)
    d = model.decision_function(x)
    rho = float(model.offset_[0])
    out = np.empty(len(rows))
    neg = d < 0
    if neg.any():
        out[neg] = -np.sqrt(np.maximum(math.log(rho) - _log_kernel_sum(model, x[neg]), 0.0) / model._gamma)
    refs = bundle.get("pos_ref", {})
    for i in np.flatnonzero(~neg):
        ref = refs.get(int(round(rows[i]["replicas"])), bundle.get("pos_ref_all", 1.0))
        out[i] = min(1.0, d[i] / ref)
    return out


def score(bundle, reading):
    """>= 0 normal (0..1, 1 = typically healthy), < 0 anomaly (minus the distance from the healthy region)."""
    return float(scores(bundle, reading)[0])


def embedding(bundle, reading):
    """The reading in the model's space (a list of 4 floats): the incident memory's embedding."""
    return [round(float(x), 5) for x in transform(bundle["params"], reading)[0]]


def min_healthy_pods(bundle, throughput):
    """The smallest pod count the model calls healthy for this throughput (latency at its floor, no errors), from
    the counts it was trained on: (count, True), or (the largest count, False) when none is."""
    counts = sorted(bundle["healthy_ranges"])
    probe = [{"throughput": throughput, "latency_p95": 0.0, "error_rate": 0.0, "replicas": float(n)} for n in counts]
    healthy = [n for n, d in zip(counts, decision(bundle, probe)) if d >= 0]
    return (healthy[0], True) if healthy else (counts[-1], False)


def explain(bundle, reading):
    """Which metrics are outside the healthy range seen in training for this replica count, in physical units, with
    the objectives next to them. The physical reading of a negative score, for the agent, the logs and the memory."""
    n = int(round(reading["replicas"]))
    ranges = bundle["healthy_ranges"].get(n)
    if ranges is None:
        return [f"no healthy data for {n} pod(s): the model was trained on {sorted(bundle['healthy_ranges'])}"]
    p = bundle["params"]
    out = []
    lo, hi = ranges["rps_per_pod"]
    rps = reading["throughput"] / max(reading["replicas"], 1)
    if rps > hi:
        out.append(f"load per pod {rps:.1f} rps is above the healthy maximum {hi:.1f} for {n} pod(s) (under-provisioned)")
    elif rps < lo:
        out.append(f"load per pod {rps:.1f} rps is below the healthy minimum {lo:.1f} for {n} pod(s) (over-provisioned)")
    if reading["latency_p95"] > ranges["latency_p95"]:
        out.append(f"p95 latency {reading['latency_p95']:.2f} s is above the healthy maximum "
                   f"{ranges['latency_p95']:.2f} s (objective {p['nfr_p95']:g} s)")
    err = reading.get("error_rate") or 0.0
    if err > ranges["error_rate"]:
        out.append(f"{100 * err:.1f}% of requests fail (5xx); healthy maximum {100 * ranges['error_rate']:.1f}% "
                   f"(objective {100 * p['nfr_errors']:g}%)")
    return out or ["every metric is inside its healthy range for this pod count; only their combination is unusual"]


def judge_trajectory(scores, eps, window_full_at, stuck_readings=3):
    """Verdict on the scores read every 10 s after an action's rollout converged (oldest first): the user's rule
    (2026-10-26, design_decisions.md A28), one reading at a time.

      STABLE    the last reading is healthy (score >= 0);
      UNSTABLE  worse: the score fell by more than eps since the reading before; or not improving: it has not risen by
                more than eps over the last `stuck_readings` readings;
      WAIT      anomalous but moving back towards healthy, or too early to tell.
    window_full_at: index of the first reading whose 1 m rate windows hold only post-action data. Before it the
    readings still mix the old minute in, so only STABLE or WAIT; the comparisons use post-action readings only.
    eps: the measurement noise of a reading in the model's units (bundle["noise_eps"]).
    """
    if scores and scores[-1] >= 0:
        return "STABLE"
    post = scores[window_full_at:] if window_full_at is not None else []
    if len(post) < 2:
        return "WAIT"
    if post[-1] < post[-2] - eps:
        return f"UNSTABLE: worse (score {post[-2]:+.2f} -> {post[-1]:+.2f} in 10 s)"
    if len(post) > stuck_readings and post[-1] - post[-1 - stuck_readings] <= eps:
        return (f"UNSTABLE: not improving (score {post[-1 - stuck_readings]:+.2f} -> {post[-1]:+.2f} "
                f"over the last {stuck_readings * 10} s)")
    return "WAIT"
