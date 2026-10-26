"""
The NFR metrics (thesis phase 2, 2026-10-22): ONE place for the PromQL that the detector, the verification of
an action, the evaluation and the ML scripts read. Until phase 2 the same queries were copy-pasted in four files.

What the user sees is measured at the ingress (ingress-nginx, 1-infrastructure/ingress-metrics.yaml): the
backend's own histogram does not time requests that wait behind a blocked event loop (design_decisions.md A24).
  throughput     requests/s that reached the app (all statuses)
  error_rate     share of 5xx (502/503/504 from nginx included: no ready pod, upstream gone)
  latency_p95    95th percentile of the request time, seconds
  replicas       desired replica count (the deployment's spec): what the strategy asked for. A pod that is
                 not ready (readiness probe) still counts, so a broken pod lowers the per-pod health
                 instead of silently shrinking the denominator.
  ready_replicas pods ready to serve (diagnostics only)
  avg_cpu_per_pod  CPU cores per ready pod: diagnostics, the HPA target and the agent's pod view only; it is
                 NOT a model input (the detector watches symptoms, not causes).
Derived: rps_per_pod = throughput / replicas.

The NFR values live here too (agent v10, 2026-10-26, design_decisions.md A28): the capacity discovery, the training,
the agent, the evaluation and the reports import them, so a new objective (or a new application) is one change here
plus the three ML scripts.
"""
import math
import time

import requests

# The non-functional requirements, as users see them at the ingress.
NFR_P95 = 0.35          # p95 latency objective, seconds
NFR_ERRORS = 0.01       # share of requests that may fail (5xx)
MAX_PODS = 3            # cost: at most this many backend pods
# "Safe": the headroom below the objectives for the time a reaction takes (detection, agent, a new pod). The capacity
# table is measured at this level, and the health model's healthy data are the readings within it.
SAFE_P95 = 0.25
SAFE_ERRORS = 0.001

PROMETHEUS_URL = "http://prometheus.aiops"
HOST = 'host="mwtback.aiops"'
DEPLOY = 'namespace="default", deployment="aiops-backend-deployment"'
PODS = 'namespace="default", pod=~"aiops-backend-deployment-.*", container!=""'
WINDOW = "1m"


def queries(window=WINDOW):
    return {
        "throughput": f'sum(rate(nginx_ingress_controller_requests{{{HOST}}}[{window}]))',
        "error_rate": (f'(sum(rate(nginx_ingress_controller_requests{{{HOST}, status=~"5.."}}[{window}])) or vector(0))'
                       f' / sum(rate(nginx_ingress_controller_requests{{{HOST}}}[{window}]))'),
        "latency_p95": (f'histogram_quantile(0.95, sum(rate('
                        f'nginx_ingress_controller_request_duration_seconds_bucket{{{HOST}}}[{window}])) by (le))'),
        "replicas": f'kube_deployment_spec_replicas{{{DEPLOY}}}',
        "ready_replicas": f'kube_deployment_status_replicas_available{{{DEPLOY}}}',
        "avg_cpu_per_pod": (f'sum(rate(container_cpu_usage_seconds_total{{{PODS}}}[{window}]))'
                            f' / scalar(kube_deployment_status_replicas_available{{{DEPLOY}}})'),
    }


# A reading is unusable without these; the rest are optional diagnostics.
REQUIRED = ("throughput", "latency_p95", "replicas")


def _query(promql, at=None):
    params = {"query": promql}
    if at is not None:
        params["time"] = at
    result = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params=params, timeout=5).json()["data"]["result"]
    if not result:
        return None
    value = float(result[0]["value"][1])
    return None if math.isnan(value) or math.isinf(value) else value


def fetch_reading(window=WINDOW, at=None):
    """One reading of every metric (dict), or None if a required one is missing. `at`: unix time (default now)."""
    reading = {}
    for name, promql in queries(window).items():
        try:
            reading[name] = _query(promql, at)
        except (requests.RequestException, KeyError, ValueError):
            reading[name] = None
    if any(reading[name] is None for name in REQUIRED) or reading["replicas"] < 1:
        return None
    # No 5xx series yet / no traffic: no errors.
    reading["error_rate"] = reading["error_rate"] or 0.0
    reading["rps_per_pod"] = reading["throughput"] / reading["replicas"]
    reading["timestamp"] = time.strftime("%H:%M:%S", time.localtime(at)) if at else time.strftime("%H:%M:%S")
    return reading


def fetch_range(start, end, step=10, window=WINDOW):
    """Every metric over [start, end] at `step` seconds: {name: {unix_time: value}} (for the evaluation)."""
    out = {}
    for name, promql in queries(window).items():
        r = requests.get(f"{PROMETHEUS_URL}/api/v1/query_range",
                         params={"query": promql, "start": start, "end": end, "step": step}, timeout=30).json()
        series = r["data"]["result"]
        out[name] = {int(float(t)): float(v) for t, v in series[0]["values"]} if series else {}
    return out
