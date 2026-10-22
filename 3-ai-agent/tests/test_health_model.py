"""
The phase-2 modules shared by the detector, the verification, the memory and the ML scripts (2026-10-22):
health_model.py (transform, score, explain, embedding, the bundle check) and nfr_metrics.py (one reading from
Prometheus). judge_trajectory is tested in test_agent_logic.py with the verification that uses it.

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

PARAMS = {"form": "per_pod", "load_mean": 3.5, "load_std": 0.8, "p95_floor": 0.2, "p95_weight": 4.0,
          "err_weight": 300.0, "rep_weight": 8.0}


def reading(reps=1, rps=40.0, p95=0.1, err=0.0):
    return {"replicas": float(reps), "throughput": rps, "rps_per_pod": rps / reps, "latency_p95": p95,
            "error_rate": err}


def test_transform_floors_latency_and_scales_each_input():
    x = hm.transform(PARAMS, [reading(p95=0.05), reading(p95=0.19), reading(p95=0.4, err=0.01, reps=2, rps=80)])
    assert x.shape == (3, 4)
    assert x[0, 1] == x[1, 1] == pytest.approx(4.0 * math.log(0.2))       # every p95 under the floor is the same
    assert x[2, 1] == pytest.approx(4.0 * math.log(0.4))
    assert x[0, 0] == pytest.approx((math.log(40) - 3.5) / 0.8)          # log load per pod, standardized
    assert x[2, 0] == x[0, 0]                                            # 2 pods at 80 rps = 40 per pod
    assert x[2, 2] == pytest.approx(3.0) and x[2, 3] == 16.0             # 1% errors, 2 pods


def test_total_form_uses_the_whole_throughput():
    x = hm.transform({**PARAMS, "form": "total"}, reading(reps=2, rps=80))
    assert x[0, 0] == pytest.approx((math.log(80) - 3.5) / 0.8)


def test_missing_error_rate_counts_as_no_errors():
    r = reading()
    r["error_rate"] = None
    assert hm.transform(PARAMS, r)[0, 2] == 0.0


def test_score_and_embedding_use_the_same_space(tmp_path):
    healthy = [reading(rps=r) for r in np.linspace(20, 80, 40)]
    model = OneClassSVM(nu=0.02, gamma=0.02).fit(hm.transform(PARAMS, healthy))
    bundle = {"model_type": "OneClassSVM-NFR", "params": PARAMS, "model": model}
    assert hm.score(bundle, reading(rps=50)) > hm.score(bundle, reading(rps=50, p95=3.0))
    assert hm.embedding(bundle, reading()) == [round(float(v), 5) for v in hm.transform(PARAMS, reading())[0]]
    joblib.dump(bundle, tmp_path / "ok.pkl")
    assert hm.load(tmp_path / "ok.pkl")["params"] == PARAMS
    joblib.dump({"model_type": "ocsvm", "models": {}}, tmp_path / "phase1.pkl")
    with pytest.raises(ValueError):
        hm.load(tmp_path / "phase1.pkl")


def test_explain_names_what_is_outside_the_healthy_range_in_physical_units():
    bundle = {"healthy_ranges": {1: {"rps_per_pod": [5.0, 80.0], "latency_p95": 0.25, "error_rate": 0.001},
                                 2: {"rps_per_pod": [28.0, 78.0], "latency_p95": 0.24, "error_rate": 0.001}}}
    assert "above the healthy maximum 80.0 for 1 pod(s) (under-provisioned)" in hm.explain(bundle, reading(rps=95))[0]
    assert "below the healthy minimum 28.0 for 2 pod(s) (over-provisioned)" in hm.explain(bundle, reading(2, 40))[0]
    stuck = hm.explain(bundle, reading(p95=3.0, err=0.5))
    assert any("p95 latency 3.00 s" in s for s in stuck) and any("50.0% of requests fail" in s for s in stuck)
    assert hm.explain(bundle, reading(rps=40))[0].startswith("every metric is inside")
    assert hm.explain(bundle, reading(reps=4, rps=160))[0].startswith("no healthy data for 4 pod(s)")


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
