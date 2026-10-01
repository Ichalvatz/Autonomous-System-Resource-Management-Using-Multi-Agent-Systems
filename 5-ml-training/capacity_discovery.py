#!/usr/bin/env python3
"""
Capacity Discovery — Phase 1 of the ML Training Pipeline
=========================================================

For each replica count (1–3), gradually ramps up concurrent users
hitting the backend until the system reaches its breaking point.
Each count's ramp starts at the previous count's safe load (known safe).

Breaking point — ANY ONE of these triggers it, and it must show up on two
consecutive measurements at the same load (a single noisy reading is ignored):
  • avg_cpu_per_pod  > 0.75  → Only 25% headroom left before the 1-core limit
  • cpu_throttling   > 0.08  → Kernel CFS scheduler is starving the container
  • latency_p95      > 1.0s  → 1 in 20 requests takes over a second

Output:
  • capacity_discovery_log.csv  — full metric trace at every step
  • capacity_table.json         — max safe VUs per replica count
                                  (consumed by Phase 2 data collection)

Usage:
    python capacity_discovery.py
"""

import json
import random
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests as http_client

# ─── Configuration ──────────────────────────────────────────────────────────

PROMETHEUS_URL = "http://prometheus.aiops"
APP_BASE_URL = "http://mwtback.aiops"
DEPLOYMENT = "aiops-backend-deployment"
NAMESPACE = "default"

# Breaking-point thresholds
# These define "the pod can't take any more" — NOT the health-training boundary.
# Training filter thresholds (in train_health_baseline.py) are looser; collection
# already stays below the safe VUs found here, so the filter only drops outliers.
BP_CPU = 0.75           # 75% of 1 core
BP_THROTTLE = 0.08      # 8% of CPU periods throttled
BP_LATENCY = 1.0        # 1 second P95

# Test ladder
REPLICA_RANGE = [1, 2, 3]  # >3 x 1-core pods saturates the host (see "Pod sizing" in CLAUDE.md)
INITIAL_VUS = 2         # Start with 2 concurrent users
VU_STEP = 2             # Add 2 users per step
MAX_VUS = 80            # Safety cap (stop even if no breaking point)

# Timing
SCALE_SETTLE_S = 45     # Wait after scaling replicas (pods starting up)
STEP_SETTLE_S = 60      # Wait after adding VUs so the 1m rate() window only sees this step
N_READINGS = 3          # Prometheus readings per step
READING_INTERVAL_S = 10 # Seconds between readings


# Prometheus queries (identical to anomaly_detector.py)
QUERIES = {
    "avg_cpu_per_pod": (
        'sum(rate(container_cpu_usage_seconds_total'
        '{namespace="default", pod=~"aiops-backend-deployment-.*",'
        ' container!=""}[1m]))'
        ' / scalar(kube_deployment_status_replicas_available'
        '{namespace="default",'
        ' deployment="aiops-backend-deployment"})'
    ),
    "throughput": (
        'sum(rate(http_requests_total{app="aiops-backend"}[1m]))'
    ),
    "latency_p95": (
        'histogram_quantile(0.95,'
        ' sum(rate(http_request_duration_seconds_bucket'
        '{app="aiops-backend"}[1m])) by (le))'
    ),
    "active_replicas": (
        'kube_deployment_status_replicas_available'
        '{namespace="default",'
        ' deployment="aiops-backend-deployment"}'
    ),
    "cpu_throttling": (
        'sum(increase(container_cpu_cfs_throttled_periods_total'
        '{namespace="default", pod=~"aiops-backend-deployment-.*",'
        ' container!=""}[1m]))'
        ' / sum(increase(container_cpu_cfs_periods_total'
        '{namespace="default", pod=~"aiops-backend-deployment-.*",'
        ' container!=""}[1m]))'
    ),
}

OUTPUT_DIR = Path(__file__).resolve().parent
LOG_CSV = OUTPUT_DIR / "capacity_discovery_log.csv"
CAPACITY_JSON = OUTPUT_DIR / "capacity_table.json"


# ─── Traffic Generator ──────────────────────────────────────────────────────

LOGIN_URL = f"{APP_BASE_URL}/auth/login"
LOGIN_PAYLOAD = json.dumps({"email": "user1@example.com", "password": "password123"})
LOGIN_HEADERS = {"Content-Type": "application/json"}


def _user_loop(stop_event: threading.Event):
    """Simulate one user continuously hitting the /auth/login endpoint."""
    # Random start offset so users don't fire in lockstep: k6 ramps VUs in
    # gradually, so live traffic arrives spread out rather than in bursts.
    if stop_event.wait(random.uniform(0, 1)):
        return
    session = http_client.Session()
    while not stop_event.is_set():
        try:
            session.post(
                LOGIN_URL,
                data=LOGIN_PAYLOAD,
                headers=LOGIN_HEADERS,
                timeout=10,
            )
        except Exception:
            pass
        # 1s sleep between requests — matches baseline.js for controlled throughput
        time.sleep(1)


class TrafficGenerator:
    """
    Manages a growing pool of virtual users.

    Only supports ramping UP — new threads are added on top of existing
    ones so traffic never drops between steps, keeping the Prometheus
    rate() window smooth.
    """

    def __init__(self):
        self._threads: list[threading.Thread] = []
        self._stop = threading.Event()

    def add_users(self, count: int):
        """Spawn `count` additional virtual users."""
        for _ in range(count):
            t = threading.Thread(
                target=_user_loop, args=(self._stop,), daemon=True,
            )
            t.start()
            self._threads.append(t)

    @property
    def active_users(self) -> int:
        return len(self._threads)

    def stop_all(self):
        """Signal all threads to stop and wait briefly for wind-down."""
        self._stop.set()
        time.sleep(2)
        self._threads.clear()
        self._stop = threading.Event()


# ─── Kubernetes Helpers ─────────────────────────────────────────────────────

def scale_deployment(replicas: int):
    subprocess.run(
        [
            "kubectl", "scale", "deployment", DEPLOYMENT,
            f"--replicas={replicas}", "-n", NAMESPACE,
        ],
        check=True,
        capture_output=True,
    )


def wait_for_replicas(target: int, timeout: int = 120) -> bool:
    """Poll Prometheus until active_replicas matches target."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        val = _fetch_one("active_replicas")
        if val is not None and int(val) == target:
            return True
        time.sleep(5)
    return False


# ─── Prometheus Helpers ─────────────────────────────────────────────────────

def _fetch_one(name: str):
    """Fetch a single metric from Prometheus. Returns float or None."""
    try:
        r = http_client.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={"query": QUERIES[name]},
            timeout=5,
        )
        r.raise_for_status()
        results = r.json().get("data", {}).get("result", [])
        if results:
            val = float(results[0]["value"][1])
            return None if pd.isna(val) else val
        return None
    except Exception:
        return None


def fetch_all() -> dict | None:
    """Fetch all 5 metrics. Returns None if any metric is unavailable."""
    metrics = {}
    for name in QUERIES:
        val = _fetch_one(name)
        if val is None:
            return None
        metrics[name] = val
    return metrics


def averaged_reading() -> dict | None:
    """Take N_READINGS spaced by READING_INTERVAL_S and return the mean."""
    readings = []
    for i in range(N_READINGS):
        if i > 0:
            time.sleep(READING_INTERVAL_S)
        m = fetch_all()
        if m is not None:
            readings.append(m)

    if not readings:
        return None

    avg = {}
    for key in readings[0]:
        avg[key] = sum(r[key] for r in readings) / len(readings)
    return avg


# ─── Breaking Point Detection ───────────────────────────────────────────────

def check_breaking_point(m: dict) -> tuple[bool, str]:
    """Returns (is_broken, human-readable reason)."""
    if m["avg_cpu_per_pod"] > BP_CPU:
        return True, f"CPU {m['avg_cpu_per_pod']:.2f} > {BP_CPU}"
    if m["cpu_throttling"] > BP_THROTTLE:
        return True, f"Throttle {m['cpu_throttling'] * 100:.1f}% > {BP_THROTTLE * 100:.0f}%"
    if m["latency_p95"] > BP_LATENCY:
        return True, f"Latency {m['latency_p95']:.3f}s > {BP_LATENCY}s"
    return False, ""


# ─── Main Discovery Loop ────────────────────────────────────────────────────

def ramp_start_vus(capacity: dict, replicas: int) -> int:
    """N replicas can always carry what N-1 carried safely, so start the ramp
    at the previous count's safe load instead of re-testing the low range."""
    prev = capacity.get(str(replicas - 1))
    if prev and prev["max_safe_vus"] >= INITIAL_VUS:
        return prev["max_safe_vus"]
    return INITIAL_VUS


def discover_capacity() -> dict:
    capacity = {}
    log_rows = []
    traffic = TrafficGenerator()

    print("=" * 70)
    print("  CAPACITY DISCOVERY — Phase 1")
    print(f"  Breaking point: CPU > {BP_CPU} | "
          f"Throttle > {BP_THROTTLE * 100:.0f}% | "
          f"Latency > {BP_LATENCY}s")
    print("=" * 70)

    try:
        for replicas in REPLICA_RANGE:
            print(f"\n{'─' * 70}")
            print(f"  🔧 Testing {replicas} replica(s)")
            print(f"{'─' * 70}")

            # Scale and wait for pods
            scale_deployment(replicas)
            print(f"  Waiting for {replicas} pod(s) to be ready ...", end="", flush=True)
            if not wait_for_replicas(replicas):
                print(f" ⚠️ timeout! Skipping.")
                continue
            print(f" ready.")
            print(f"  Settling for {SCALE_SETTLE_S}s ...")
            time.sleep(SCALE_SETTLE_S)

            # Reset traffic for this replica count
            traffic.stop_all()
            start_vus = ramp_start_vus(capacity, replicas)
            safe_vus = 0
            safe_rps = 0.0
            breaking_rps = None
            breaking_reason = ""
            # Set when a reading crosses a threshold; the same load is then
            # re-measured, and only a second breaking reading confirms it.
            unconfirmed_break = False

            vus = 0
            while vus < MAX_VUS or unconfirmed_break:
                if unconfirmed_break:
                    print(f"\n  🔁 {vus:>3} VUs │ re-measuring after {STEP_SETTLE_S}s ",
                          end="", flush=True)
                else:
                    # Ramp: add users on top of existing traffic
                    add = start_vus if vus == 0 else VU_STEP
                    traffic.add_users(add)
                    vus = traffic.active_users
                    print(f"\n  📊 {vus:>3} VUs │ settling {STEP_SETTLE_S}s ",
                          end="", flush=True)
                time.sleep(STEP_SETTLE_S)
                print("│ measuring ", end="", flush=True)

                # Measure
                metrics = averaged_reading()
                if metrics is None:
                    print("│ ⚠️ metrics unavailable, skipping step")
                    continue

                # Log this step
                log_rows.append({
                    "timestamp": datetime.now().isoformat(),
                    "replicas": replicas,
                    "vus": vus,
                    **{k: round(v, 4) for k, v in metrics.items()},
                })

                cpu_pct = metrics["avg_cpu_per_pod"]
                thr_pct = metrics["cpu_throttling"] * 100
                lat = metrics["latency_p95"]
                tput = metrics["throughput"]

                broken, reason = check_breaking_point(metrics)

                if broken and not unconfirmed_break:
                    unconfirmed_break = True
                    print(f"│ ⚠️ {reason} — re-measuring same load to rule out noise")
                    continue

                if broken:
                    print(
                        f"\n\n  🔥 BREAKING POINT at {vus} VUs (confirmed)!"
                        f"\n     CPU: {cpu_pct:.2f} cores │ "
                        f"Throttle: {thr_pct:.1f}% │ "
                        f"Latency: {lat:.3f}s │ "
                        f"Throughput: {tput:.1f} rps"
                        f"\n     Reason: {reason}"
                    )
                    breaking_reason = reason
                    breaking_rps = tput
                    if safe_vus == 0:
                        print(
                            f"     ⚠️ Already broken at the starting load ({vus} VUs); "
                            "the host may be out of CPU for this many replicas."
                        )
                    break
                else:
                    if unconfirmed_break:
                        print("│ previous reading was noise ", end="")
                    unconfirmed_break = False
                    safe_vus = vus
                    safe_rps = tput
                    print(
                        f"│ ✅ CPU: {cpu_pct:.2f} │ "
                        f"Thr: {thr_pct:.1f}% │ "
                        f"Lat: {lat:.3f}s │ "
                        f"Tput: {tput:.1f} rps"
                    )
            else:
                print(f"\n  ℹ️ Reached {MAX_VUS} VUs without breaking point.")

            # VUs drive collect_healthy_data.py; rps is what the agent compares
            # against live throughput (1 VU sends slightly under 1 req/s).
            capacity[str(replicas)] = {
                "max_safe_vus": safe_vus,
                "max_safe_rps": round(safe_rps, 2),
                "breaking_vus": vus if breaking_reason else None,
                "breaking_rps": round(breaking_rps, 2) if breaking_rps is not None else None,
                "breaking_reason": breaking_reason or None,
            }

            # Cool down before next replica count
            traffic.stop_all()
            print(f"\n  Cooling down 15s before next replica count ...")
            time.sleep(15)

    except KeyboardInterrupt:
        print("\n\n⏹️ Interrupted by user.")
    finally:
        traffic.stop_all()
        # Reset to 1 replica after discovery
        try:
            scale_deployment(1)
            print("  Reset deployment to 1 replica.")
        except Exception:
            pass

    # ─── Save results ────────────────────────────────────────────────────
    if log_rows:
        pd.DataFrame(log_rows).to_csv(LOG_CSV, index=False)
        print(f"\n📄 Full metric trace saved to: {LOG_CSV}")

    if capacity:
        with open(CAPACITY_JSON, "w") as f:
            json.dump(capacity, f, indent=2)
        print(f"📄 Capacity table saved to: {CAPACITY_JSON}")

    # ─── Print summary ──────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("  CAPACITY TABLE")
    print(f"{'=' * 70}")
    header = (
        f"  {'Replicas':>8} │ {'Safe VUs':>10} │ "
        f"{'Break VUs':>10} │ Reason"
    )
    print(header)
    print(f"  {'─' * 8}─┼─{'─' * 10}─┼─{'─' * 10}─┼─{'─' * 25}")
    for r in REPLICA_RANGE:
        key = str(r)
        if key in capacity:
            c = capacity[key]
            safe = c["max_safe_vus"]
            brk = c["breaking_vus"] or "—"
            reason = c["breaking_reason"] or "not reached"
            print(f"  {r:>8} │ {str(safe):>10} │ {str(brk):>10} │ {reason}")
    print()

    return capacity


if __name__ == "__main__":
    discover_capacity()
