#!/usr/bin/env python3
"""
Capacity discovery, phase 2 (2026-10-22): the capacity of each replica count in terms of the NFRs.

For each replica count (1-4: the 4th only re-checks the host ceiling), fresh pods, then the request mix of the
experiments (4-load-testing/k6/lib/mix.js) at a fixed arrival rate (open model) for STEP_S seconds per step,
rising step by step. After each step one reading at the ingress (nfr_metrics.py, 1 m windows: only this step):
  safe       the highest rate with p95 <= SAFE_P95 (0.25 s: headroom below the 0.35 s objective for the time a
             scale-up takes) and errors <= SAFE_ERR;
  slo_limit  the first rate with p95 > SLO_P95 (0.35 s) or errors > SLO_ERR (1%): the objective is broken.
A breaking reading only counts if a second step at the same rate also breaks (one noisy reading is ignored, as
in phase 1). The search for a count stops at its slo_limit; the next count starts at this count's safe rate.
CPU per pod is recorded too, only for the HPA target (the native baseline's knob is CPU).

  python 5-ml-training/capacity_discovery.py            (~70-90 min; detector OFF, no other traffic)

Writes capacity_discovery_log.csv (every step) and capacity_table.json (per count: max_safe_rps, slo_limit_rps,
the p95 and CPU per pod at the safe rate, and the users that rate stands for at USER_RPS requests/s per user).
"""
import json
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

from k6_driver import make_token_pool, nfr_metrics, restart_and_wait, run_k6

HERE = Path(__file__).resolve().parent
LOG_CSV = HERE / "capacity_discovery_log.csv"
CAPACITY_JSON = HERE / "capacity_table.json"
RUN_LOG = HERE / "runs" / f"capacity_{datetime.now():%Y%m%d_%H%M}.k6.log"

REPLICA_RANGE = [1, 2, 3, 4]
SAFE_P95, SLO_P95 = 0.25, 0.35
SAFE_ERR, SLO_ERR = 0.001, 0.01
STEP_S = 90
IDLE_AFTER_SCALE_S = 60
# Ladder: set from the endpoint costs (endpoint_costs.py, 2026-10-22): see START_RPS / STEP_RPS below.
START_RPS = 20.0          # first rate for 1 pod
STEP_RPS = 5.0            # per pod: the step grows with the replica count
MAX_RPS_PER_POD = 400.0   # safety stop
USER_RPS = 0.2            # one active user = one request every 5 s (to state the capacity in users)


def step(rate, rows, replicas):
    started = time.time()
    k6 = run_k6("constant_rate.js", {"RATE": f"{rate:.1f}", "DURATION": f"{STEP_S}s"}, RUN_LOG)
    reading = nfr_metrics.fetch_reading(at=started + STEP_S - 1) or {}
    row = {"time": datetime.now().strftime("%H:%M:%S"), "replicas": replicas, "rate": rate, **reading, **k6}
    rows.append(row)
    pd.DataFrame(rows).to_csv(LOG_CSV, index=False)
    p95, err = reading.get("latency_p95", float("inf")), reading.get("error_rate", 1.0)
    print(f"  {replicas} pod(s) {rate:6.1f} rps -> got {reading.get('throughput', 0):6.1f}, p95 {p95:.3f} s, "
          f"errors {100 * err:.2f}%, CPU/pod {reading.get('avg_cpu_per_pod') or 0:.2f}, "
          f"k6 dropped {k6.get('k6_dropped', '?')}", flush=True)
    return row, p95, err


def discover(replicas, start, rows):
    print(f"\n=== {replicas} pod(s): fresh pods, ladder from {start:.1f} rps ===", flush=True)
    restart_and_wait(replicas)
    time.sleep(IDLE_AFTER_SCALE_S)
    safe_ok = lambda p95, err: p95 <= SAFE_P95 and err <= SAFE_ERR
    rate, safe_row, broken, limit = start, None, False, None
    while rate <= MAX_RPS_PER_POD * replicas:
        row, p95, err = step(rate, rows, replicas)
        if not safe_ok(p95, err):
            row, p95, err = step(rate, rows, replicas)          # a break counts only if a second step confirms it
        if safe_ok(p95, err):
            if not broken:
                safe_row = row                                   # safe = the highest good rate before the first break
        else:
            broken = True
            if p95 > SLO_P95 or err > SLO_ERR:
                limit = rate
                break
        rate = round(rate + STEP_RPS * replicas, 1)
    safe = safe_row["rate"] if safe_row else None
    return {
        "max_safe_rps": safe,
        "slo_limit_rps": limit,
        "p95_at_safe": round(safe_row["latency_p95"], 3) if safe_row else None,
        "cpu_per_pod_at_safe": round(safe_row.get("avg_cpu_per_pod") or 0, 3) if safe_row else None,
        "users_at_safe": round(safe / USER_RPS) if safe else None,
    }


def main():
    RUN_LOG.parent.mkdir(exist_ok=True)
    make_token_pool()
    rows, table = [], {}
    start = START_RPS
    for replicas in REPLICA_RANGE:
        table[replicas] = discover(replicas, start, rows)
        print(f"--> {replicas} pod(s): {table[replicas]}", flush=True)
        CAPACITY_JSON.write_text(json.dumps({str(k): v for k, v in table.items()}, indent=2))
        if table[replicas]["max_safe_rps"]:
            start = table[replicas]["max_safe_rps"]
    restart_and_wait(1)
    print("\nCapacity table:", json.dumps(table, indent=2))


if __name__ == "__main__":
    main()
