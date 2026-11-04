"""
The healthy reference of the Node.js event-loop lag per pod (v14, A33, 2026-11-04), for get_pod_breakdown.

The agent's restart rule names "event-loop lag several times the healthy reference", but until v14 the pod breakdown
gave a healthy reference only for CPU per request, p95 and throttling, so the model compared pods with each other: in
the ingress slowdowns of 1/11 one pod at 0.32 s against 0.08 s read as a bad process state, and the agent restarted.
This measures the lag of healthy traffic: the HPA's normal-load runs still in Prometheus (campaigns of 26/10, 28/10,
1/11), at every 10 s reading where the service was healthy at the ingress (p95 <= the safe level, errors <= the safe
level, every pod ready), one value per pod. Read-only; prints the distribution and writes healthy_lag.json.

Usage (repo root):  .venv/bin/python3 5-ml-training/measure_healthy_lag.py
"""
import csv
import json
import os
import statistics
import sys
from datetime import datetime

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "3-ai-agent"))
import nfr_metrics  # noqa: E402

LAG = 'max by (pod) (nodejs_eventloop_lag_p99_seconds{namespace="default", pod=~"aiops-backend-deployment-.*"})'
RPS = ('sum by (pod) (rate(http_requests_total{namespace="default", pod=~"aiops-backend-deployment-.*"}[1m]))')
OUT = os.path.join(ROOT, "5-ml-training", "healthy_lag.json")
CAMPAIGNS = ("campaign-2026-10-26", "campaign-2026-10-28", "campaign-2026-11-01")


def by_pod(promql, start, end):
    r = requests.get(f"{nfr_metrics.PROMETHEUS_URL}/api/v1/query_range",
                     params={"query": promql, "start": start, "end": end, "step": 10}, timeout=60).json()
    return {s["metric"].get("pod", "?"): {int(float(t)): float(v) for t, v in s["values"]}
            for s in r["data"]["result"]}


def main():
    runs = [r for r in csv.DictReader(open(os.path.join(ROOT, "4-load-testing", "results_nfr.csv")))
            if r["label"] == "hpa" and r["notes"] in CAMPAIGNS]
    values, per_run = [], []
    for run in runs:
        start = datetime.strptime(run["start"], "%Y-%m-%d %H:%M:%S").timestamp()
        end = datetime.strptime(run["end"], "%Y-%m-%d %H:%M:%S").timestamp()
        ingress = nfr_metrics.fetch_range(start, end)
        lag, rps = by_pod(LAG, start, end), by_pod(RPS, start, end)
        n = 0
        for t, p95 in ingress.get("latency_p95", {}).items():
            err = ingress.get("error_rate", {}).get(t, 0.0)
            reps, ready = ingress.get("replicas", {}).get(t), ingress.get("ready_replicas", {}).get(t)
            if p95 > nfr_metrics.SAFE_P95 or err > nfr_metrics.SAFE_ERRORS or not reps or ready != reps:
                continue
            for pod, series in lag.items():
                if t in series and rps.get(pod, {}).get(t, 0) >= 5:   # a serving pod (below ~5 req/s idle CPU dominates)
                    values.append((series[t], rps[pod][t]))
                    n += 1
        per_run.append((run["start"], n))
    lags = sorted(v for v, _ in values)
    q = lambda p: lags[min(len(lags) - 1, int(p * len(lags)))]
    result = {"readings": len(lags), "runs": len(runs), "median_s": round(statistics.median(lags), 3),
              "p90_s": round(q(0.90), 3), "p99_s": round(q(0.99), 3), "max_s": round(lags[-1], 3),
              "source": f"HPA normal-load runs of {', '.join(CAMPAIGNS)}, readings healthy at the ingress",
              "measured": datetime.now().isoformat(timespec="seconds")}
    for lo, hi in ((5, 50), (50, 70), (70, 90), (90, 200)):
        band = sorted(v for v, r in values if lo <= r < hi)
        if band:
            result[f"by_load_{lo}_{hi}_rps"] = {"n": len(band), "median_s": round(statistics.median(band), 3),
                                                "p99_s": round(band[min(len(band) - 1, int(0.99 * len(band)))], 3),
                                                "max_s": round(band[-1], 3)}
    print(json.dumps(result, indent=1))
    print("per run (start, pod readings):", per_run)
    json.dump(result, open(OUT, "w"), indent=1)


if __name__ == "__main__":
    main()
