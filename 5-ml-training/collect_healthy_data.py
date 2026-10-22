#!/usr/bin/env python3
"""
Healthy training data, phase 2 (2026-10-22): the NFR metrics of every replica count across its healthy band.

For each replica count (1-3), fresh pods, then the request mix of the experiments (k6/lib/mix.js) along a
continuous arrival-rate ramp from the bottom of the count's band up to its safe rate (capacity_table.json) and
back down, while a reading of the ingress metrics (nfr_metrics.py, the detector's own queries) is taken every
READING_S seconds. Bands, as in phase 1: 1 pod from LOW_RPS; N pods from OVERLAP x safe(N-1), the anti-flapping
deadband: N-1 scales up above its safe rate, N scales down only below 70% of it. The low end of 1 pod (few
requests per window, noisy p95) is ramped slowly.

  python 5-ml-training/collect_healthy_data.py         (~55 min; detector OFF, no other traffic)

Writes baseline_metrics_healthy.csv: one row per reading (time, replicas, direction, the k6 target rate, the
NFR metrics, and CPU per pod for reference only).
"""
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path

import pandas as pd

from k6_driver import K6_DIR, TOKENS_FILE, make_token_pool, nfr_metrics, restart_and_wait

HERE = Path(__file__).resolve().parent
CAPACITY_JSON = HERE / "capacity_table.json"
OUTPUT_CSV = HERE / "baseline_metrics_healthy.csv"
RUN_LOG = HERE / "runs" / f"collect_{datetime.now():%Y%m%d_%H%M}.k6.log"

REPLICA_RANGE = [1, 2, 3]
OVERLAP = 0.7
LOW_RPS = 1.0
READING_S = 15
WARMUP_S = 60          # the first 1 m windows still hold the idle time before the ramp
IDLE_AFTER_SCALE_S = 60


def stages_for(replicas, lo, hi):
    """(start rate, [(target, seconds), ...]): up and back down, ~16 min; the 1-pod low end slower."""
    if replicas == 1:
        knee = lo + 0.25 * (hi - lo)
        return lo, [(knee, 240), (hi, 300), (knee, 300), (lo, 240)]
    return lo, [(hi, 480), (lo, 480)]


def target_at(start, stages, t):
    """The k6 target rate t seconds after the ramp started (piecewise linear), and the direction."""
    rate = start
    for target, seconds in stages:
        if t <= seconds:
            return rate + (target - rate) * t / seconds, "up" if target > rate else "down"
        t -= seconds
        rate = target
    return rate, "end"


def collect(replicas, lo, hi, rows):
    print(f"\n=== {replicas} pod(s): band {lo:.1f} -> {hi:.1f} rps and back ===", flush=True)
    restart_and_wait(replicas)
    time.sleep(IDLE_AFTER_SCALE_S)
    start_rate, stages = stages_for(replicas, lo, hi)
    total = sum(s for _, s in stages)
    cmd = ["k6", "run", "--quiet", "-e", f"TOKENS_FILE={TOKENS_FILE}", "-e", f"START={start_rate:.1f}",
           "-e", "STAGES=" + json.dumps([[round(t, 1), f"{s}s"] for t, s in stages]), str(K6_DIR / "ramp_rate.js")]
    with open(RUN_LOG, "a") as log:
        k6 = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
        started = time.time()
        while k6.poll() is None:
            time.sleep(READING_S)
            t = time.time() - started
            if t < WARMUP_S or t > total:
                continue
            reading = nfr_metrics.fetch_reading()
            if reading is None:
                print("  (missing metric, skipped)", flush=True)
                continue
            target, direction = target_at(start_rate, stages, t)
            rows.append({"replicas_set": replicas, "direction": direction, "target_rps": round(target, 2), **reading})
            pd.DataFrame(rows).to_csv(OUTPUT_CSV, index=False)
            print(f"  {reading['timestamp']} {replicas} pod(s) {direction:4} target {target:6.1f}: "
                  f"{reading['throughput']:6.1f} rps, p95 {reading['latency_p95']:.3f} s, "
                  f"errors {100 * reading['error_rate']:.2f}%", flush=True)


def main():
    RUN_LOG.parent.mkdir(exist_ok=True)
    table = {int(k): v for k, v in json.loads(CAPACITY_JSON.read_text()).items()}
    make_token_pool()
    rows = []
    for replicas in REPLICA_RANGE:
        lo = LOW_RPS if replicas == 1 else OVERLAP * table[replicas - 1]["max_safe_rps"]
        collect(replicas, lo, table[replicas]["max_safe_rps"], rows)
    restart_and_wait(1)
    print(f"\n{len(rows)} readings -> {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
