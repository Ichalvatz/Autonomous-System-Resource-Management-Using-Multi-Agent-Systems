"""
Rule-based autoscaler: the threshold baseline for the thesis evaluation.

It gets exactly what the LLM agent gets (same five metrics and PromQL, the same
capacity table, the same safety-guarded scale tool, the same settle / low-traffic
/ 3-in-a-row / cooldown gates), but fixed rules replace both the One-Class SVM
and the LLM. Any difference in the results is therefore down to the decision
maker, not to extra information.

Rules (the agent prompt's 3 tiers, hard-coded):
  UP    p95 > 0.35 s, throttling > 5 %, CPU/pod > 0.75, or rps > safe rps of the current count
        -> the smallest count whose safe rps covers the load (at least +1)
  DOWN  none of the above and rps < 70 % of the safe rps of (count - 1)
        (the same 70 % deadband the healthy-data collector uses)
        -> the smallest count m with rps < 70 % of safe(m)

Rules v2 (RULES_RESTART=on, added 2026-10-03; default off = the baseline measured before):
the restart rules a competent engineer would write AFTER seeing the two faults, checked
before the scaling rules. They answer the reviewer's question "would a better rule set
not do what the LLM does?" for the faults it was written for.
  R1 stuck     p95 > 0.35 s while CPU/pod < 0.5 and throttling < 5 %  -> rolling restart
  R2 runaway   CPU per request > 2x the healthy 0.073 core-s (rps >= 1) -> rolling restart
  (R1 = prompt v4's restart path, R2 = prompt v5's derived signal, both as fixed thresholds.)

Run from the repo root:  python 3-ai-agent/rule_scaler.py   (RULES_RESTART=on for rules v2)
"""
import json
import os
import signal
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anomaly_detector import (  # noqa: E402  (same PromQL and gates as the detector)
    QUERIES, INTERVAL_SECONDS, MIN_THROUGHPUT_RPS, ANOMALY_STREAK_REQUIRED,
    REPLICA_SETTLE_SECONDS, AGENT_COOLDOWN_SECONDS, fetch_metric, _stop_on_sigterm,
)
from agent_tools import (  # noqa: E402
    scale_kubernetes_deployment, restart_kubernetes_deployment, MIN_REPLICAS, MAX_REPLICAS,
    HEALTHY_CPU_PER_REQUEST,
)

SLO_P95 = 0.35
SLO_THROTTLING = 0.05
SLO_CPU = 0.75
DOWN_DEADBAND = 0.70
RESTART_RULES = os.getenv("RULES_RESTART", "off").lower() == "on"
STUCK_MAX_CPU = 0.5
RUNAWAY_FACTOR = 2.0

CAPACITY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "5-ml-training", "capacity_table.json")
with open(CAPACITY_PATH) as f:
    SAFE_RPS = {int(k): v["max_safe_rps"] for k, v in json.load(f).items()}


def decide(m):
    """Return the target replica count for these metrics (== current means no action)."""
    n = int(m["active_replicas"])
    rps = m["throughput"]
    pressure = (m["latency_p95"] > SLO_P95 or m["cpu_throttling"] > SLO_THROTTLING
                or m["avg_cpu_per_pod"] > SLO_CPU)
    if pressure or rps > SAFE_RPS.get(n, 0):
        covering = [c for c in sorted(SAFE_RPS) if SAFE_RPS[c] >= rps]
        target = covering[0] if covering else MAX_REPLICAS
        return min(max(target, n + 1), MAX_REPLICAS)
    if n > MIN_REPLICAS and rps < DOWN_DEADBAND * SAFE_RPS[n - 1]:
        for m_count in sorted(SAFE_RPS):
            if rps < DOWN_DEADBAND * SAFE_RPS[m_count]:
                return max(m_count, MIN_REPLICAS)
        return n - 1
    return n


def restart_reason(m):
    """Rules v2 only: the fault signature that calls for a restart, or None."""
    if (m["latency_p95"] > SLO_P95 and m["avg_cpu_per_pod"] < STUCK_MAX_CPU
            and m["cpu_throttling"] < SLO_THROTTLING):
        return "R1 stuck (p95 above SLO while CPU idle)"
    if m["throughput"] >= 1:
        cost = m["avg_cpu_per_pod"] * m["active_replicas"] / m["throughput"]
        if cost > RUNAWAY_FACTOR * HEALTHY_CPU_PER_REQUEST:
            return f"R2 runaway (CPU per request {cost:.3f} > {RUNAWAY_FACTOR:g}x healthy)"
    return None


def main():
    print(f"📏 Rule-based scaler{' v2 (with restart rules)' if RESTART_RULES else ''}. "
          f"Safe rps per replica count: {SAFE_RPS}")
    streak, last_target = 0, None
    last_replicas, changed_at, cooldown_until = None, None, 0.0
    while True:
        m = {name: fetch_metric(name, q) for name, q in QUERIES.items()}
        ts = datetime.now().strftime("%H:%M:%S")
        if any(v is None for v in m.values()):
            streak = 0
            time.sleep(INTERVAL_SECONDS)
            continue
        if last_replicas is not None and m["active_replicas"] != last_replicas:
            changed_at = time.monotonic()
        last_replicas = m["active_replicas"]
        if changed_at is not None and time.monotonic() - changed_at < REPLICA_SETTLE_SECONDS:
            streak = 0
            time.sleep(INTERVAL_SECONDS)
            continue
        if m["throughput"] < MIN_THROUGHPUT_RPS:
            streak = 0
            time.sleep(INTERVAL_SECONDS)
            continue

        current = int(m["active_replicas"])
        reason = restart_reason(m) if RESTART_RULES else None
        target = "restart" if reason else decide(m)
        print(f"[{ts}] rps {m['throughput']:.1f} cpu {m['avg_cpu_per_pod']:.2f} "
              f"thr {m['cpu_throttling']*100:.1f}% p95 {m['latency_p95']:.3f}s "
              f"reps {current} -> target {target}{f' [{reason}]' if reason else ''}")
        if target == current:
            streak, last_target = 0, None
        else:
            streak = streak + 1 if target == last_target else 1
            last_target = target
            if streak >= ANOMALY_STREAK_REQUIRED and time.monotonic() >= cooldown_until:
                if target == "restart":
                    print(f"[{ts}] RULE ACTION ({reason}): {restart_kubernetes_deployment()}")
                else:
                    print(f"[{ts}] RULE ACTION: {scale_kubernetes_deployment(replicas=target)}")
                streak, last_target = 0, None
                cooldown_until = time.monotonic() + AGENT_COOLDOWN_SECONDS
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _stop_on_sigterm)
    try:
        main()
    except KeyboardInterrupt:
        print("\n⏹️ Rule-based scaler stopped.")
