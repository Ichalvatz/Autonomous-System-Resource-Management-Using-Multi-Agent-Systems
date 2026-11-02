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
import math

import joblib
import numpy as np
from scipy.special import logsumexp

FEATURES = ["throughput", "latency_p95", "error_rate", "replicas"]
MODEL_TYPE = "OneClassSVM-NFR-v11"
# exp(-gamma * 100^2) = 0 for every gamma tried: neighbouring pod counts never share kernel mass (A30).
POD_SEPARATION = 100.0


def load(path):
    bundle = joblib.load(path)
    if not isinstance(bundle, dict) or bundle.get("model_type") != MODEL_TYPE:
        raise ValueError(f"{path} is not a v11 health model bundle (retrain with train_health_baseline.py)")
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


def judge_trajectory(scores, eps, judge_from, window_full_at, stuck_readings=3):
    """Verdict on the scores read every 10 s after an action's rollout converged (oldest first): the user's rule
    (2026-10-26, design_decisions.md A28), one reading at a time.

      STABLE    the last reading is healthy (score >= 0);
      UNSTABLE  worse: the score fell by more than eps since the reading before; or not improving: it has not risen by
                more than eps over the last `stuck_readings` readings;
      WAIT      anomalous but moving back towards healthy, or too early to tell.
    judge_from: index of the first reading "worse" may use (VERIFY_JUDGE_FROM_SECONDS = 10 s after the rollout, v12,
    A31): the reading right after an action can dip (judged from it, 6 of 61 recorded actions gave a false "worse").
    window_full_at: index of the first reading whose 1 m windows hold only post-action data; "not improving" uses only
    these (A31.1). A fall is real even while the window still mixes the old minute in (new requests that are faster
    cannot raise a window's p95, fewer errors cannot raise its error rate), but no rise is not: the p95 of a 1 m window
    stays at the old level until the slow requests from before the action are below 5% of it (the smoke run of
    2026-11-01 18:04: p95 0.48 s for 40 s after a right scale-up, then 0.24 s). Before judge_from only STABLE or WAIT.
    eps: the measurement noise of a reading in the model's units (bundle["noise_eps"]).
    """
    if scores and scores[-1] >= 0:
        return "STABLE"
    judged = scores[judge_from:] if judge_from is not None else []
    if len(judged) >= 2 and judged[-1] < judged[-2] - eps:
        return f"UNSTABLE: worse (score {judged[-2]:+.2f} -> {judged[-1]:+.2f} in 10 s)"
    post = scores[window_full_at:] if window_full_at is not None else []
    if len(post) > stuck_readings and post[-1] - post[-1 - stuck_readings] <= eps:
        return (f"UNSTABLE: not improving (score {post[-1 - stuck_readings]:+.2f} -> {post[-1]:+.2f} "
                f"over the last {stuck_readings * 10} s)")
    return "WAIT"


# The timings of judge_trajectory, in seconds after a change took effect (A31, A31.1): one source for the agent's
# verification of its own action (agent_tools, from the converged rollout) and the detector's follow of a pod-count
# change no verification watched (anomaly_detector, from the first reading at the new count; A32).
JUDGE_FROM_SECONDS = 10       # "worse" from here: the first reading after a change can dip
WINDOW_FULL_SECONDS = 60      # "not improving" from here: the 1 m windows hold only post-change data
GIVE_UP_SECONDS = 240         # still anomalous -> UNSTABLE


def follow_verdict(points, eps):
    """judge_trajectory on (seconds since the change, score) points, oldest first, with the timings above; still
    anomalous after GIVE_UP_SECONDS -> UNSTABLE."""
    scores = [s for _, s in points]
    judge_from = next((i for i, (t, _) in enumerate(points) if t >= JUDGE_FROM_SECONDS), None)
    window_full_at = next((i for i, (t, _) in enumerate(points) if t >= WINDOW_FULL_SECONDS), None)
    verdict = judge_trajectory(scores, eps, judge_from, window_full_at)
    if verdict == "WAIT" and points and points[-1][0] >= GIVE_UP_SECONDS:
        verdict = f"UNSTABLE: still anomalous after {GIVE_UP_SECONDS // 60} min"
    return verdict
