"""
The health model of the agent (v12 since 2026-11-01, design_decisions.md A31: v11's model, A30, tested with range probes
and trained with the 1-pod low end; v10 A28): ONE One-Class SVM over the NFR
metrics (load, latency, errors, pod count) that alone decides at run time. The NFRs (nfr_metrics.py) are built into
the model instead of rules around it:
  - healthy training data = the readings within the safe level (p95 <= SAFE_P95, errors <= SAFE_ERRORS;
    5-ml-training/train_health_baseline.py);
  - the inputs are in NFR units, with no tuned weights (transform): for latency and errors 0 = the safe level and
    1 = the objective, and everything within the safe level counts the same, so a faster or cleaner state is never
    judged worse (A28.1: a model that also learned "normal latency for this load" below it was not monotone);
  - the acceptance probes require p95 = NFR_P95 and NFR_ERRORS of errors to be anomalies at every load of every pod count.
Every healthy training reading sits at the safe level of both NFRs, so from the data the SVM learns the healthy load
of each pod count (the bands, which the latency set through the safe level), and latency and errors count as the
distance above the safe level (A28.1, A30). The only choice in training is gamma. Since every support vector then sits
on the load axis, the kernel sum of N pods is exp(-gamma * r^2) * K_N(ln rps), r = the distance above the safe level:
healthy <=> r^2 <= ln(K_N / rho) / gamma, so a scan along the load covers every reading (A31).
Shared by the detector, the verification of an action, the detector's follow of a pod-count change (A32), the incident
memory (its embedding space), the agent's facts (the minimum pod count) and the training script, so they all see a
reading the same way.

Inputs (constants in the bundle's params, from nfr_metrics at training time):
  x0 = ln(throughput)                                              1 = e times the load
  x1 = ln(max(p95, SAFE_P95) / SAFE_P95) / ln(NFR_P95 / SAFE_P95)  0 = safe level, 1 = objective
  x2 = (max(errors, SAFE_ERRORS) - SAFE_ERRORS) / (NFR_ERRORS - SAFE_ERRORS)   same
  x3 = POD_SEPARATION * replicas                                   far apart: one healthy region per pod count
The score is the SVM's own decision function d = sum_i a_i * exp(-gamma * |x - x_i|^2) - rho, read as a distance:
  d >= 0: min(1, d / d_ref), d_ref = the median d of the healthy readings of this pod count: 1 = typically healthy;
  d <  0: -sqrt(log(rho / sum) / gamma), the log of the kernel sum: the distance from the healthy region in the units
          of x. Same boundary as the SVM; unlike d itself it does not flatten far away (v9's -0.537 for every fault),
          so a trajectory shows how far the state is and whether it moves back.
"""
import json
import math
import os

import joblib
import numpy as np
from scipy.special import logsumexp

FEATURES = ["throughput", "latency_p95", "error_rate", "replicas"]
MODEL_TYPE = "OneClassSVM-NFR-v11"
# exp(-gamma * 100^2) = 0 for every gamma tried: neighbouring pod counts never share kernel mass (A30).
POD_SEPARATION = 100.0


def load(path, window_noise=True):
    """The bundle saved by train_health_baseline.py, with the noise of readings after a change (window_noise.json next
    to it, measure_window_noise.py, A32.1) as bundle["window_noise"] when window_noise is True."""
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or bundle.get("model_type") != MODEL_TYPE:
        raise ValueError(f"{path} is not a v11 health model bundle (retrain with train_health_baseline.py)")
    if window_noise:
        noise_path = os.path.join(os.path.dirname(path), "window_noise.json")
        if not os.path.exists(noise_path):
            raise ValueError(f"{noise_path} is missing: run 5-ml-training/measure_window_noise.py")
        noise = json.load(open(noise_path))
        if noise.get("model_trained_at") != bundle.get("trained_at"):
            raise ValueError(f"{noise_path} was measured with another model: run measure_window_noise.py again")
        bundle["window_noise"] = noise
    return bundle


def _rows(readings):
    if isinstance(readings, dict):
        return [readings]
    return readings.to_dict("records") if hasattr(readings, "to_dict") else readings


def transform(params, readings):
    """readings: a dict, a list of dicts or a DataFrame with throughput, latency_p95, error_rate, replicas."""
    rows = _rows(readings)
    out = np.empty((len(rows), 4))
    safe_p95, safe_err = params["safe_p95"], params["safe_errors"]
    lat_unit = math.log(params["nfr_p95"] / safe_p95)
    err_unit = params["nfr_errors"] - safe_err
    for i, r in enumerate(rows):
        out[i, 0] = math.log(max(r["throughput"], 0.01))
        out[i, 1] = math.log(max(r["latency_p95"], safe_p95) / safe_p95) / lat_unit
        out[i, 2] = (max(r.get("error_rate") or 0.0, safe_err) - safe_err) / err_unit
        out[i, 3] = params["pod_separation"] * r["replicas"]
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
    """The smallest pod count the model calls healthy for this throughput (latency and errors at the safe level), from
    the counts it was trained on: (count, True); when none is, (the smallest count whose band does not end below this
    load, False): the smallest count below every band, the largest above them (v12, A31: v10 / v11 returned the largest
    in both cases, so 1 pod at an idle 2 rps got "minimum 3"). The band tops decide, not the rounded band bottoms."""
    counts = sorted(bundle["bands"])
    probe = [{"throughput": throughput, "latency_p95": 0.0, "error_rate": 0.0, "replicas": float(n)} for n in counts]
    healthy = [n for n, d in zip(counts, decision(bundle, probe)) if d >= 0]
    if healthy:
        return healthy[0], True
    return next((n for n in counts if throughput <= bundle["bands"][n][1]), counts[-1]), False


def explain(bundle, reading):
    """Which metrics are outside what the model calls healthy for this pod count, in physical units: the load against
    the model's band (latency and errors at the safe level), latency and errors against the safe level, with the
    objectives next to them. The physical reading of a negative score, for the agent, the logs and the memory."""
    n = int(round(reading["replicas"]))
    band = bundle["bands"].get(n)
    if band is None:
        return [f"no healthy data for {n} pod(s): the model was trained on {sorted(bundle['bands'])}"]
    p = bundle["params"]
    out = []
    lo, hi = band
    load = reading["throughput"]
    per_pod = load / max(reading["replicas"], 1)
    if load > hi:
        out.append(f"load {load:.1f} rps ({per_pod:.1f} per pod) is above the healthy maximum {hi:.1f} rps for {n} "
                   "pod(s) (under-provisioned)")
    elif load < lo:
        out.append(f"load {load:.1f} rps ({per_pod:.1f} per pod) is below the healthy minimum {lo:.1f} rps for {n} "
                   "pod(s) (over-provisioned)")
    if reading["latency_p95"] > p["safe_p95"]:
        out.append(f"p95 latency {reading['latency_p95']:.2f} s is above the safe level {p['safe_p95']:g} s "
                   f"(objective {p['nfr_p95']:g} s)")
    err = reading.get("error_rate") or 0.0
    if err > p["safe_errors"]:
        out.append(f"{100 * err:.1f}% of requests fail (5xx); safe level {100 * p['safe_errors']:g}% "
                   f"(objective {100 * p['nfr_errors']:g}%)")
    return out or ["every metric is inside its healthy range for this pod count; only their combination is unusual"]


# Judging a change (the verification of an action, the detector's follow of a pod-count change; A32.1, 2026-11-02).
# Every reading is made only of data since the change took effect (nfr_metrics.clean_window): the first one 20 s after
# it, then every 10 s, its window growing to the usual minute. Until A32.1 the readings were the usual 1 m windows, which
# for a minute mix the state before the change in, so the rule needed fixed times ("worse" from 10 s, "not improving"
# from 60 s); with post-change data only, those reasons are gone.
GIVE_UP_SECONDS = 240         # still anomalous this long after the change -> UNSTABLE (a safety bound)
# A new pod is ready in ~10 s; one that never becomes ready (the stuck one after a scale-up) must not hold the judgement:
# the change counts as taken effect after this long at most.
ROLLOUT_WAIT_SECONDS = 90
STUCK_READINGS = 3            # "not improving": no rise over this many readings (30 s)


def change_noise(bundle, kind, seconds):
    """The noise of a comparison of readings since a change (window_noise.json): kind "step" (10 s apart) or "span"
    (STUCK_READINGS readings apart), for the later reading taken `seconds` after the change."""
    table = bundle["window_noise"][kind]
    key = min(table, key=lambda k: abs(int(k) - seconds))      # the nearest measured time (past +120 s: +120 s)
    return float(table[key])


def judge_trajectory(bundle, points):
    """Verdict on the readings after a change: points = (seconds since the change took effect, score), oldest first,
    every reading made of post-change data only. The user's rule (2026-10-26, design_decisions.md A28), one reading at a
    time:
      STABLE    the last reading is healthy (score >= 0);
      UNSTABLE  worse: the score fell since the reading before by more than the noise of that comparison; or not
                improving: it has not risen over the last STUCK_READINGS readings by more than the noise of that
                comparison; or still anomalous GIVE_UP_SECONDS after the change;
      WAIT      anomalous and not worse: moving towards healthy, or too few readings yet to tell (not improving needs
                STUCK_READINGS + 1 of them).
    The noise depends on how much data the readings hold (change_noise, measured on the steady anomalous periods of the
    HPA runs: 10 s apart 0.38 between the readings at +20 and +30 s, 0.10 between +50 and +60 s; 30 s apart 0.47 between
    +20 and +50 s, ~0.25 once the windows are a minute long)."""
    if not points:
        return "WAIT"
    t, s = points[-1]
    if s >= 0:
        return "STABLE"
    if len(points) >= 2:
        prev = points[-2][1]
        if s < prev - change_noise(bundle, "step", t):
            return f"UNSTABLE: worse (score {prev:+.2f} -> {s:+.2f} in 10 s)"
    if len(points) > STUCK_READINGS:
        old = points[-1 - STUCK_READINGS][1]
        if s - old <= change_noise(bundle, "span", t):
            return (f"UNSTABLE: not improving (score {old:+.2f} -> {s:+.2f} over the last "
                    f"{STUCK_READINGS * 10} s)")
    if t >= GIVE_UP_SECONDS:
        return f"UNSTABLE: still anomalous after {GIVE_UP_SECONDS // 60} min"
    return "WAIT"
