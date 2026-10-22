"""
Score one experiment window from Prometheus history, the same way for every
scaling strategy (LLM agent, HPA, rule-based, static), so results are comparable.

Usage (from repo root):
    python 4-load-testing/evaluate_run.py --label llm-agent --start "2026-09-30 23:25:15" --end "2026-10-01 00:05:20"
    python 4-load-testing/evaluate_run.py --label hpa --run-dir 4-load-testing/eval_hpa_0010   # reads window.txt

Appends one row to 4-load-testing/evaluation_results.csv and prints it.

Metrics (step = 10 s, same PromQL as the detector):
  slo_violation_s     time with p95 > 0.35 s (the agent's SLO: what users feel)
  pressure_s          time with CPU/pod > 0.75 or throttling > 5% (the agent's Tier-1 targets)
  replica_minutes     integral of desired replicas (cost)
  under_prov_s        time with fewer replicas than the capacity table needs for the current rps
  over_prov_s         time with more replicas than needed (waste)
  correct_prov_pct    time with exactly the needed count ("scaling accuracy")
  scale_actions       changes of desired replicas
  + for LLM runs: incidents, verified STABLE, LLM calls, mean agent seconds (from incident_log.csv)
"""
import argparse
import csv
import json
import os
from datetime import datetime

import requests

PROM = "http://prometheus.aiops/api/v1/query_range"
STEP = 10
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(ROOT, "4-load-testing", "evaluation_results.csv")
INCIDENTS = os.path.join(ROOT, "3-ai-agent", "incident_log.csv")
CAPACITY = os.path.join(ROOT, "5-ml-training", "capacity_table.json")
SLO_P95 = 0.35
RECOVERY_HOLD_S = 60
# Highest CPU cost per request in the healthy training data (core-seconds; median 0.073).
# Above it, CPU is being burned by something other than user traffic.
HEALTHY_MAX_CPU_PER_REQUEST = 0.10

QUERIES = {
    "throughput": 'sum(rate(http_requests_total{app="aiops-backend"}[1m]))',
    "latency_p95": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))',
    "avg_cpu_per_pod": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / scalar(kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"})',
    "cpu_throttling": 'sum(increase(container_cpu_cfs_throttled_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / sum(increase(container_cpu_cfs_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))',
    "desired_replicas": 'kube_deployment_spec_replicas{namespace="default", deployment="aiops-backend-deployment"}',
}


def fetch(query, start, end):
    r = requests.get(PROM, params={"query": query, "start": start, "end": end, "step": STEP}, timeout=30)
    r.raise_for_status()
    result = r.json()["data"]["result"]
    if not result:
        return {}
    return {int(float(t)): float(v) for t, v in result[0]["values"]}


def needed_replicas(rps, table):
    for n in sorted(table):
        if rps <= table[n]:
            return n
    return max(table)  # beyond the cap: the most we are allowed to run


def append_row(path, row):
    """Append to the results CSV. If the row has columns the file lacks, rewrite the file with
    the union header (a plain DictWriter append would silently shift the columns)."""
    rows, fields = [], []
    if os.path.exists(path):
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            fields, rows = list(reader.fieldnames or []), list(reader)
    new_fields = [k for k in row if k not in fields]
    if rows and not new_fields:
        with open(path, "a", newline="") as f:
            csv.DictWriter(f, fieldnames=fields).writerow(row)
        return
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields + new_fields)
        w.writeheader()
        w.writerows(rows + [row])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--label", required=True, help="strategy name, e.g. llm-agent, hpa, rules, static-1")
    p.add_argument("--start")
    p.add_argument("--end")
    p.add_argument("--run-dir", help="directory with window.txt (two lines: start, end)")
    p.add_argument("--notes", default="")
    p.add_argument("--results", default=RESULTS, help="CSV to append to (fault scenarios use their own file)")
    p.add_argument("--fault-at", help="fault injection time 'YYYY-MM-DDTHH:MM:SS': adds recovery metrics")
    args = p.parse_args()

    if args.run_dir:
        with open(os.path.join(args.run_dir, "window.txt")) as f:
            args.start, args.end = [line.strip() for line in f.readlines()[:2]]
    start = datetime.strptime(args.start, "%Y-%m-%d %H:%M:%S").timestamp()
    end = datetime.strptime(args.end, "%Y-%m-%d %H:%M:%S").timestamp()

    with open(CAPACITY) as f:
        table = {int(k): v["max_safe_rps"] for k, v in json.load(f).items()}

    series = {name: fetch(q, start, end) for name, q in QUERIES.items()}
    if args.run_dir:
        # Keep the raw series next to the run (added 2026-10-21): Prometheus keeps only 10 days, and by
        # then the history of every run before 2026-10-11 was gone; compare_results.py draws from this file.
        with open(os.path.join(args.run_dir, "series.json"), "w") as f:
            json.dump({name: {str(t): v for t, v in s.items()} for name, s in series.items()}, f)
    stamps = sorted(series["desired_replicas"])

    slo = pressure = under = over = correct = 0
    replica_seconds = 0.0
    actions = 0
    p95_values = []
    prev = None
    for t in stamps:
        reps = series["desired_replicas"][t]
        replica_seconds += reps * STEP
        if prev is not None and reps != prev:
            actions += 1
        prev = reps

        p95 = series["latency_p95"].get(t)
        if p95 is not None and p95 == p95:  # not NaN
            p95_values.append(p95)
            if p95 > SLO_P95:
                slo += STEP
        cpu = series["avg_cpu_per_pod"].get(t)
        thr = series["cpu_throttling"].get(t)
        if (cpu is not None and cpu > 0.75) or (thr is not None and thr > 0.05):
            pressure += STEP
        rps = series["throughput"].get(t)
        if rps is not None and rps >= 0.8:  # same low-traffic gate as the detector
            need = needed_replicas(rps, table)
            if reps < need:
                under += STEP
            elif reps > need:
                over += STEP
            else:
                correct += STEP

    judged = under + over + correct
    p95_sorted = sorted(p95_values)
    row = {
        "label": args.label,
        "start": args.start,
        "end": args.end,
        "duration_min": round((end - start) / 60, 1),
        "slo_violation_s": slo,
        "pressure_s": pressure,
        "p95_mean": round(sum(p95_values) / len(p95_values), 3) if p95_values else "",
        "p95_p99": round(p95_sorted[int(0.99 * (len(p95_sorted) - 1))], 3) if p95_sorted else "",
        "replica_minutes": round(replica_seconds / 60, 1),
        "under_prov_s": under,
        "over_prov_s": over,
        "correct_prov_pct": round(100 * correct / judged, 1) if judged else "",
        "scale_actions": actions,
        "incidents": "", "stable": "", "llm_calls": "", "agent_s_mean": "",
        "notes": args.notes,
        "run_dir": os.path.relpath(args.run_dir, ROOT) if args.run_dir else "",
    }

    if args.fault_at:
        # Recovery = first moment after the fault from which p95 stays under the SLO
        # for RECOVERY_HOLD_S. p95 is a 1-minute window, so this includes ~1 min of lag
        # for every strategy alike.
        fault = datetime.strptime(args.fault_at, "%Y-%m-%dT%H:%M:%S").timestamp()
        after = [t for t in stamps if t >= fault]
        ok = [series["latency_p95"].get(t) is not None and series["latency_p95"][t] == series["latency_p95"][t]
              and series["latency_p95"][t] <= SLO_P95 for t in after]
        hold = RECOVERY_HOLD_S // STEP
        recovered_at = next((after[i] for i in range(len(after) - hold + 1) if all(ok[i:i + hold])), None)
        # Second recovery signal, for faults the server-side p95 cannot see (cpuhog: time
        # queued behind a blocked event loop is never timed by the app's histogram): the
        # fault is gone once CPU per request is back in the healthy range and stays there.
        cpu_ok = []
        for t in after:
            cpu, rps, reps = (series["avg_cpu_per_pod"].get(t), series["throughput"].get(t),
                              series["desired_replicas"].get(t))
            cpu_ok.append(cpu is not None and rps is not None and rps >= 1 and reps is not None
                          and cpu == cpu and cpu * reps / rps <= HEALTHY_MAX_CPU_PER_REQUEST)
        cleared_at = next((after[i] for i in range(len(after) - hold + 1) if all(cpu_ok[i:i + hold])), None)
        row["fault_at_min"] = round((fault - start) / 60, 1)
        row["recovery_s"] = int(recovered_at - fault) if recovered_at is not None else "never"
        row["slo_violation_after_fault_s"] = sum(STEP for flag in ok if not flag)
        row["cpu_recovery_s"] = int(cleared_at - fault) if cleared_at is not None else "never"
        row["max_replicas_after_fault"] = int(max(series["desired_replicas"].get(t, 0) for t in after)) if after else ""
        row["agent_actions"] = ""  # filled below for LLM runs: restart vs scale is the point of a fault run

    if args.run_dir and "agent_actions" in row:
        # Rule-based runs: restarts do not change the replica count, so list the actions from
        # the controller log (rules v2 restarts for R1/R2; scale actions as "scale->N").
        import re
        log_path = os.path.join(args.run_dir, "controller.log")
        if os.path.exists(log_path):
            acts = []
            for line in open(log_path, errors="replace"):
                if "RULE ACTION" not in line or "✅" not in line:
                    continue
                ts = line[1:9]
                rule = re.search(r"\((R\d) ", line)
                to = re.search(r"to (\d+) replicas", line)
                acts.append(f"{ts} restart {rule.group(1)}" if rule else f"{ts} scale->{to.group(1) if to else '?'}")
            row["rule_actions"] = " | ".join(acts)

    if os.path.exists(INCIDENTS):
        with open(INCIDENTS) as f:
            inc = [r for r in csv.DictReader(f)
                   if start <= datetime.strptime(r["woke_at"], "%Y-%m-%d %H:%M:%S").timestamp() <= end]
        if inc:
            row["incidents"] = len(inc)
            row["stable"] = sum(r["verification"] == "STABLE" for r in inc)
            row["llm_calls"] = sum(int(r["llm_calls"] or 0) for r in inc)
            row["agent_s_mean"] = round(sum(float(r["agent_seconds"]) for r in inc) / len(inc), 1)
            if "agent_actions" in row:
                row["agent_actions"] = " | ".join(r["actions"] or "none" for r in inc)

    append_row(args.results, row)
    for k, v in row.items():
        print(f"{k:>18}: {v}")


if __name__ == "__main__":
    main()
