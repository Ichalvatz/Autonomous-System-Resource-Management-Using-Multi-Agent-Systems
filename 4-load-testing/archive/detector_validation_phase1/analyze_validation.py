"""Summarize a detector_validation.sh run, one row per phase.

Usage (repo root):
    python 4-load-testing/analyze_validation.py [readings.csv] [phases.csv]
Defaults: 5-ml-training/dry_run_readings.csv, 4-load-testing/detector_validation_phases.csv

Columns:
  evaluated   readings the model scored (settling / low-traffic readings are skipped)
  flagged     readings the model called anomalous
  wakes       times the detector would have woken the agent (3 in a row + cooldown)
  first_wake  seconds from phase start to the first wake-up
  slo_breach  readings with p95 > 0.35 s (the agent's latency SLO), i.e. real degradation
"""
import sys
from datetime import datetime

import pandas as pd

SLO_P95 = 0.35

readings_csv = sys.argv[1] if len(sys.argv) > 1 else "5-ml-training/dry_run_readings.csv"
phases_csv = sys.argv[2] if len(sys.argv) > 2 else "4-load-testing/detector_validation_phases.csv"

readings = pd.read_csv(readings_csv)
phases = pd.read_csv(phases_csv)


def seconds(hms):
    t = datetime.strptime(hms, "%H:%M:%S")
    return t.hour * 3600 + t.minute * 60 + t.second


readings["t"] = readings["timestamp"].map(seconds)
phases["t"] = phases["time"].map(seconds)
readings["would_trigger"] = readings["would_trigger"].astype(str).str.strip() == "True"

rows = []
for i, phase in phases.iterrows():
    start = phase["t"]
    end = phases["t"].iloc[i + 1] if i + 1 < len(phases) else readings["t"].max() + 1
    r = readings[(readings["t"] >= start) & (readings["t"] < end)]
    wakes = r[r["would_trigger"]]
    rows.append({
        "phase": phase["phase"],
        "replicas": phase["replicas"],
        "expected": phase["expected"],
        "evaluated": len(r),
        "flagged": int((r["prediction"] == -1).sum()),
        "wakes": len(wakes),
        "first_wake": int(wakes["t"].iloc[0] - start) if len(wakes) else None,
        "slo_breach": int((r["latency_p95"] > SLO_P95).sum()),
        "p95_median": round(r["latency_p95"].median(), 3) if len(r) else None,
        "rps_median": round(r["throughput"].median(), 1) if len(r) else None,
    })

summary = pd.DataFrame(rows)
pd.set_option("display.width", 200)
print(summary.to_string(index=False))

normal = summary[summary["expected"] == "normal"]
anomaly = summary[summary["expected"] != "normal"]
print(
    f"\nAnomaly phases detected: {(anomaly['wakes'] > 0).sum()}/{len(anomaly)}"
    f"   Normal phases with wake-ups: {(normal['wakes'] > 0).sum()}/{len(normal)}"
    f" ({int(normal['wakes'].sum())} wake-ups, of which in phases with SLO breaches:"
    f" {int(normal.loc[normal['slo_breach'] > 0, 'wakes'].sum())})"
)
