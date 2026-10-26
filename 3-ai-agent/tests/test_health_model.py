"""
The phase-2 modules shared by the detector, the verification, the memory and the ML scripts: health_model.py (the
v10 transform in NFR units, the score read as a distance, the minimum healthy pod count, explain, embedding, the
bundle check; design_decisions.md A28) and nfr_metrics.py (one reading from Prometheus, the NFR values).
judge_trajectory is tested in test_agent_logic.py with the verification that uses it.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import math
import os
import sys
from unittest import mock

import joblib
import numpy as np
import pytest
from sklearn.svm import OneClassSVM

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import health_model as hm  # noqa: E402
import nfr_metrics  # noqa: E402

PARAMS = {"load_mean": 4.0, "load_std": 0.8, "p95_floor": 0.25, "nfr_p95": 0.35, "nfr_errors": 0.01,
          "w_load": 1.0, "w_lat": 2.0, "w_err": 1.0, "w_rep": 8.0}


def reading(reps=1, rps=40.0, p95=0.1, err=0.0):
    return {"replicas": float(reps), "throughput": rps, "rps_per_pod": rps / reps, "latency_p95": p95,
            "error_rate": err}


@pytest.fixture(scope="module")
def bundle():
    """A small v10 model: 1 pod healthy from 10 to 80 rps, 2 pods from 60 to 160 rps, latency within the safe level."""
    healthy = ([reading(1, r, p95=0.1) for r in np.geomspace(10, 80, 30)]
               + [reading(2, r, p95=0.15) for r in np.geomspace(60, 160, 30)])
    model = OneClassSVM(nu=0.02, gamma=0.2).fit(hm.transform(PARAMS, healthy))
    b = {"model_type": hm.MODEL_TYPE, "params": PARAMS, "model": model, "gamma": 0.2,
         "healthy_ranges": {1: {"rps_per_pod": [10.0, 80.0], "latency_p95": 0.1, "error_rate": 0.001},
                            2: {"rps_per_pod": [30.0, 80.0], "latency_p95": 0.15, "error_rate": 0.001}}}
    d = hm.decision(b, healthy)
    b["pos_ref"] = {1: float(np.median(d[:30][d[:30] > 0])), 2: float(np.median(d[30:][d[30:] > 0]))}
    return b


def test_nfr_values_live_in_one_place_and_the_safe_level_is_below_the_objective():
    assert nfr_metrics.NFR_P95 == 0.35 and nfr_metrics.NFR_ERRORS == 0.01 and nfr_metrics.MAX_PODS == 3
    assert nfr_metrics.SAFE_P95 < nfr_metrics.NFR_P95 and nfr_metrics.SAFE_ERRORS < nfr_metrics.NFR_ERRORS


def test_transform_is_in_nfr_units_and_every_latency_up_to_the_safe_level_counts_the_same():
    x = hm.transform(PARAMS, [reading(p95=0.05), reading(p95=0.25), reading(reps=2, rps=80, p95=0.35, err=0.01)])
    assert x.shape == (3, 4)
    assert x[0, 1] == x[1, 1] == pytest.approx(2.0 * math.log(0.25 / 0.35))   # at or below the safe level: the floor
    assert x[2, 1] == pytest.approx(0.0)                                       # at the latency objective
    assert x[2, 2] == pytest.approx(1.0)                                       # 1% errors = the error objective
    assert x[0, 0] == pytest.approx((math.log(40) - 4.0) / 0.8) and x[2, 3] == 16.0


def test_missing_error_rate_counts_as_no_errors():
    r = reading()
    r["error_rate"] = None
    assert hm.transform(PARAMS, r)[0, 2] == 0.0


def test_score_is_0_to_1_when_healthy_and_a_distance_that_does_not_flatten_when_not(bundle):
    healthy = hm.score(bundle, reading(rps=30))
    assert 0 < healthy <= 1
    assert hm.score(bundle, reading(rps=30, p95=0.05)) == healthy                 # faster than safe: the same
    slow, slower = hm.score(bundle, reading(rps=30, p95=0.5)), hm.score(bundle, reading(rps=30, p95=3.0))
    assert slower < slow < 0                                                      # monotone in latency
    e20, e60, e100 = (hm.score(bundle, reading(rps=30, err=e)) for e in (0.2, 0.6, 1.0))
    assert e100 < e60 < e20 < 0 and e100 - e60 < -10                              # v9 flattened all of these at -0.537
    # the sign is the SVM's own decision
    for r in (reading(rps=30), reading(rps=200), reading(rps=30, p95=0.5), reading(2, 100)):
        assert (hm.score(bundle, r) < 0) == (hm.decision(bundle, r)[0] < 0)


def test_min_healthy_pods_is_the_smallest_count_the_model_calls_healthy(bundle):
    assert hm.min_healthy_pods(bundle, 40) == (1, True)
    assert hm.min_healthy_pods(bundle, 120) == (2, True)
    assert hm.min_healthy_pods(bundle, 900) == (2, False)


def test_embedding_and_bundle_check(bundle, tmp_path):
    assert hm.embedding(bundle, reading()) == [round(float(v), 5) for v in hm.transform(PARAMS, reading())[0]]
    joblib.dump(bundle, tmp_path / "ok.pkl")
    assert hm.load(tmp_path / "ok.pkl")["params"] == PARAMS
    joblib.dump({"model_type": "OneClassSVM-NFR", "params": {}}, tmp_path / "v9.pkl")
    with pytest.raises(ValueError):
        hm.load(tmp_path / "v9.pkl")


def test_explain_names_what_is_outside_the_healthy_range_with_the_objectives():
    b = {"params": PARAMS,
         "healthy_ranges": {1: {"rps_per_pod": [5.0, 80.0], "latency_p95": 0.25, "error_rate": 0.001},
                            2: {"rps_per_pod": [28.0, 78.0], "latency_p95": 0.24, "error_rate": 0.001}}}
    assert "above the healthy maximum 80.0 for 1 pod(s) (under-provisioned)" in hm.explain(b, reading(rps=95))[0]
    assert "below the healthy minimum 28.0 for 2 pod(s) (over-provisioned)" in hm.explain(b, reading(2, 40))[0]
    stuck = hm.explain(b, reading(p95=3.0, err=0.5))
    assert any("p95 latency 3.00 s" in s and "(objective 0.35 s)" in s for s in stuck)
    assert any("50.0% of requests fail" in s and "(objective 1%)" in s for s in stuck)
    assert hm.explain(b, reading(rps=40))[0].startswith("every metric is inside")
    assert hm.explain(b, reading(reps=4, rps=160))[0].startswith("no healthy data for 4 pod(s)")


def _prom(values):
    """Fake Prometheus: the first query whose text contains a key gets that value (None = no result)."""
    def get(url, params, timeout):
        resp = mock.MagicMock()
        q = params["query"]
        key = next(k for k in values if k in q)
        v = values[key]
        resp.json.return_value = {"data": {"result": [] if v is None else [{"value": [0, str(v)]}]}}
        return resp
    return mock.patch.object(nfr_metrics.requests, "get", side_effect=get)


ORDER = {"status=~\"5..\"": 0.02, "duration_seconds_bucket": 0.12, "kube_deployment_spec_replicas": 2,
         "status_replicas_available": 2, "container_cpu_usage": 0.4, "nginx_ingress_controller_requests": 90.0}


def test_fetch_reading_derives_load_per_pod():
    with _prom(ORDER):
        r = nfr_metrics.fetch_reading()
    assert r["throughput"] == 90.0 and r["rps_per_pod"] == 45.0 and r["latency_p95"] == 0.12
    assert r["error_rate"] == 0.02 and r["replicas"] == 2 and r["ready_replicas"] == 2


def test_fetch_reading_without_a_required_metric_is_none_and_missing_errors_are_zero():
    with _prom({**ORDER, "duration_seconds_bucket": None}):
        assert nfr_metrics.fetch_reading() is None
    with _prom({**ORDER, "status=~\"5..\"": None}):
        assert nfr_metrics.fetch_reading()["error_rate"] == 0.0


def test_every_query_reads_the_ingress_of_the_backend_host():
    q = nfr_metrics.queries()
    for name in ("throughput", "error_rate", "latency_p95"):
        assert 'host="mwtback.aiops"' in q[name] and "nginx_ingress_controller" in q[name]
    assert "[1m]" in q["throughput"] and "[40s]" in nfr_metrics.queries("40s")["latency_p95"]
