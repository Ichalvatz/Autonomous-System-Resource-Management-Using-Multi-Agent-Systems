"""
Score one experiment window from Prometheus history, the same way for every strategy (the LLM agent and the
Kubernetes HPA), so results are comparable. Phase 2 (2026-10-22): everything is measured at the ingress, as users
see it (3-ai-agent/nfr_metrics.py, the detector's own queries), against the NFRs: p95 < 0.35 s, errors < 1%.

Usage (from repo root):
    python 4-load-testing/evaluate_run.py --label hpa --run-dir 4-load-testing/eval_hpa_20261023_0100   # reads window.txt
    python 4-load-testing/evaluate_run.py --label llm-v9 --start "..." --end "..." [--fault-at 2026-10-23T01:04:00]

Appends one row to --results (default 4-load-testing/results_nfr.csv) and prints it.

Metrics (step = 10 s):
  slo_violation_s     time with p95 > 0.35 s
  error_s             time with more than 1% of requests failing (5xx at the ingress, incl. "no ready pod")
  nfr_violation_s     time with either (what the NFRs promise users)
  errors_pct          share of failed requests over the run
  p95_mean / p95_p99  of the 10 s readings
  replica_minutes     integral of desired replicas (cost)
  under/over_prov_s   time with fewer / more replicas than the capacity table needs for the current rps
  correct_prov_pct    time with exactly the needed count
  scale_actions       changes of desired replicas; replica_changes lists them (mm:ss from the start)
  unready_s           time with fewer ready pods than desired
  liveness_restarts   container restarts in the window (the liveness probe's native recoveries)
  k6_*                the load generator's view (client p95, failed share, dropped iterations: requests the
                      open-model generator could not even start because every VU was waiting)
  faults: recovery_s  first moment after the fault from which p95 <= 0.35 s AND errors <= 1% hold for 60 s
  agent runs: incidents, verified STABLE, re-wakes, LLM calls, mean agent seconds, actions (incident_log.csv)
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "3-ai-agent"))
import nfr_metrics  # noqa: E402

STEP = 10
RESULTS = os.path.join(ROOT, "4-load-testing", "results_nfr.csv")
INCIDENTS = os.path.join(ROOT, "3-ai-agent", "incident_log.csv")
CAPACITY = os.path.join(ROOT, "5-ml-training", "capacity_table.json")
SLO_P95 = 0.35
MAX_ERR = 0.01
RECOVERY_HOLD_S = 60
RESTARTS = ('sum(max_over_time(kube_pod_container_status_restarts_total{namespace="default", '
            'pod=~"aiops-backend-deployment-.*"}[%ds]))')


def needed_replicas(rps, table):
    for n in sorted(table):
        if rps <= table[n]:
            return n
    return max(table)  # beyond the cap: the most we are allowed to run


def append_row(path, row):
    """Append to the results CSV. If the row has columns the file lacks, rewrite the file with
    the union header (plain appends would shift the columns of the new row)."""
    rows, header = [], []
    if os.path.exists(path):
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            header = list(reader.fieldnames or [])
            rows = list(reader)
    new_cols = [k for k in row if k not in header]
    if new_cols or not header:
        header = header + new_cols
        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=header)
            writer.writeheader()
            writer.writerows(rows)
            writer.writerow(row)
    else:
        with open(path, "a", newline="") as f:
            csv.DictWriter(f, fieldnames=header).writerow(row)


def valid(v):
    return v is not None and v == v


def k6_summary(run_dir):
    path = os.path.join(run_dir or "", "k6_summary.json")
    if not run_dir or not os.path.exists(path):
        return {}
    m = json.load(open(path))["metrics"]
    duration = m.get("http_req_duration", {})
    return {"k6_requests": m.get("http_reqs", {}).get("count", ""),
            "k6_p95_s": round(duration.get("p(95)", 0) / 1000, 3) if duration else "",
            "k6_failed_pct": round(100 * m.get("http_req_failed", {}).get("value", 0), 2),
            "k6_dropped": m.get("dropped_iterations", {}).get("count", 0)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--label", required=True)
    p.add_argument("--start")
    p.add_argument("--end")
    p.add_argument("--run-dir")
    p.add_argument("--notes", default="")
    p.add_argument("--results", default=RESULTS)
    p.add_argument("--fault-at", help="fault injection time (YYYY-MM-DDTHH:MM:SS): adds recovery metrics")
    args = p.parse_args()
    if args.run_dir and not args.start:
        with open(os.path.join(args.run_dir, "window.txt")) as f:
            args.start, args.end = [line.strip() for line in f.readlines()[:2]]
    start = datetime.strptime(args.start, "%Y-%m-%d %H:%M:%S").timestamp()
    end = datetime.strptime(args.end, "%Y-%m-%d %H:%M:%S").timestamp()

    with open(CAPACITY) as f:
        table = {int(k): v["max_safe_rps"] for k, v in json.load(f).items() if int(k) <= 3 and v.get("max_safe_rps")}

    series = nfr_metrics.fetch_range(start, end, STEP)
    if args.run_dir:
        # The raw series next to the run: Prometheus keeps only 10 days (compare_results.py draws from this file).
        with open(os.path.join(args.run_dir, "series.json"), "w") as f:
            json.dump({name: {str(t): v for t, v in s.items()} for name, s in series.items()}, f)
    stamps = sorted(series["replicas"])

    slo = err_s = nfr = under = over = correct = unready = 0
    replica_seconds, requests_total, requests_failed = 0.0, 0.0, 0.0
    changes, p95_values, prev = [], [], None
    for t in stamps:
        reps = series["replicas"][t]
        replica_seconds += reps * STEP
        if prev is not None and reps != prev:
            changes.append(f"{int((t - start) // 60):02d}:{int((t - start) % 60):02d} {prev:.0f}->{reps:.0f}")
        prev = reps
        p95, err, rps = series["latency_p95"].get(t), series["error_rate"].get(t), series["throughput"].get(t)
        ready = series["ready_replicas"].get(t)
        bad_p95 = valid(p95) and p95 > SLO_P95
        bad_err = valid(err) and err > MAX_ERR
        if valid(p95):
            p95_values.append(p95)
        slo += STEP * bad_p95
        err_s += STEP * bad_err
        nfr += STEP * (bad_p95 or bad_err)
        unready += STEP * (valid(ready) and ready < reps)
        if valid(rps):
            requests_total += rps * STEP
            requests_failed += rps * STEP * (err if valid(err) else 0.0)
        if valid(rps) and rps >= 1.0:   # the detector's low-traffic gate
            need = needed_replicas(rps, table)
            under += STEP * (reps < need)
            over += STEP * (reps > need)
            correct += STEP * (reps == need)

    judged = under + over + correct
    p95_sorted = sorted(p95_values)
    try:
        restarts = nfr_metrics._query(RESTARTS % int(end - start), at=end)
    except Exception:
        restarts = None
    row = {
        "label": args.label, "start": args.start, "end": args.end, "duration_min": round((end - start) / 60, 1),
        "nfr_violation_s": nfr, "slo_violation_s": slo, "error_s": err_s,
        "errors_pct": round(100 * requests_failed / requests_total, 2) if requests_total else "",
        "p95_mean": round(sum(p95_values) / len(p95_values), 3) if p95_values else "",
        "p95_p99": round(p95_sorted[int(0.99 * (len(p95_sorted) - 1))], 3) if p95_sorted else "",
        "replica_minutes": round(replica_seconds / 60, 1),
        "under_prov_s": under, "over_prov_s": over,
        "correct_prov_pct": round(100 * correct / judged, 1) if judged else "",
        "scale_actions": len(changes), "replica_changes": " | ".join(changes),
        "unready_s": unready, "liveness_restarts": int(restarts) if restarts is not None else "",
        **k6_summary(args.run_dir),
        "incidents": "", "stable": "", "rewakes": "", "llm_calls": "", "agent_s_mean": "", "agent_actions": "",
        "notes": args.notes,
        "run_dir": os.path.relpath(args.run_dir, ROOT) if args.run_dir else "",
    }

    if args.fault_at:
        fault = datetime.strptime(args.fault_at, "%Y-%m-%dT%H:%M:%S").timestamp()
        after = [t for t in stamps if t >= fault]
        ok = [valid(series["latency_p95"].get(t)) and series["latency_p95"][t] <= SLO_P95
              and (series["error_rate"].get(t) or 0.0) <= MAX_ERR for t in after]
        hold = RECOVERY_HOLD_S // STEP
        recovered_at = next((after[i] for i in range(len(after) - hold + 1) if all(ok[i:i + hold])), None)
        row["fault_at_min"] = round((fault - start) / 60, 1)
        row["recovery_s"] = int(recovered_at - fault) if recovered_at is not None else "never"
        row["nfr_violation_after_fault_s"] = sum(STEP for flag in ok if not flag)
        row["max_replicas_after_fault"] = int(max(series["replicas"].get(t, 0) for t in after)) if after else ""

    if os.path.exists(INCIDENTS):
        with open(INCIDENTS) as f:
            inc = [r for r in csv.DictReader(f)
                   if start <= datetime.strptime(r["woke_at"], "%Y-%m-%d %H:%M:%S").timestamp() <= end]
        if inc:
            row["incidents"] = len(inc)
            row["stable"] = sum(r["verification"] == "STABLE" for r in inc)
            row["rewakes"] = sum(r.get("rewake") == "True" for r in inc)
            row["llm_calls"] = sum(int(r["llm_calls"] or 0) for r in inc)
            row["agent_s_mean"] = round(sum(float(r["agent_seconds"]) for r in inc) / len(inc), 1)
            row["agent_actions"] = " | ".join(f"{r['woke_at'][11:16]} {r['actions'] or 'none'}"
                                              f"{' (' + r['verification'] + ')' if r['verification'] else ''}"
                                              for r in inc)

    append_row(args.results, row)
    for k, v in row.items():
        print(f"{k:>28}: {v}")


if __name__ == "__main__":
    main()
