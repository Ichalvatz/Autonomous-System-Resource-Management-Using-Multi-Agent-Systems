"""
CPU per request of each endpoint of the mix, from a run of k6/endpoint_costs.js (thesis phase 2, 2026-10-22).

  python 4-load-testing/endpoint_costs.py "2026-10-22 16:50:00"     # the time k6 started (after setup)

At the end of each 90 s window: backend CPU (cores, all pods) / ingress request rate = core-seconds per request,
plus the ingress p95 and error share. Read-only.
"""
import sys
from datetime import datetime

import requests

PROM = "http://prometheus.aiops/api/v1/query"
ORDER = ["search", "place", "reviews", "recommendations", "login", "review_post", "favourite_post", "mix"]
Q = {
    "cpu": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))',
    "rps": 'sum(rate(nginx_ingress_controller_requests{host="mwtback.aiops"}[1m]))',
    "err": 'sum(rate(nginx_ingress_controller_requests{host="mwtback.aiops", status=~"5.."}[1m]))',
    "p95": 'histogram_quantile(0.95, sum(rate(nginx_ingress_controller_request_duration_seconds_bucket{host="mwtback.aiops"}[1m])) by (le))',
}


def value(query, at):
    r = requests.get(PROM, params={"query": query, "time": at}, timeout=10).json()["data"]["result"]
    return float(r[0]["value"][1]) if r else float("nan")


start = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S").timestamp()
print(f"{'endpoint':16} {'rps':>6} {'cpu':>6} {'ms CPU/req':>11} {'p95 s':>7} {'5xx %':>6}")
for i, name in enumerate(ORDER):
    at = start + i * 120 + 88
    v = {k: value(q, at) for k, q in Q.items()}
    print(f"{name:16} {v['rps']:6.1f} {v['cpu']:6.2f} {1000 * v['cpu'] / v['rps']:11.2f} {v['p95']:7.3f} "
          f"{100 * v['err'] / v['rps']:6.1f}")
