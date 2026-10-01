"""
Thesis comparison of scaling strategies.

Reads 4-load-testing/evaluation_results.csv (one row per run, written by
evaluate_run.py) and writes:
  4-load-testing/comparison.md              mean ± std per strategy
  4-load-testing/comparison_timelines.png   desired replicas, load and p95 per run

Usage (from repo root):  python 4-load-testing/compare_results.py
"""
import glob
import os
from datetime import datetime

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

from evaluate_run import QUERIES, SLO_P95, fetch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "evaluation_results.csv")
ORDER = ["static-1", "static-3", "hpa", "rules", "llm-v3", "llm-nomem", "llm"]
COLUMNS = [
    ("slo_violation_s", "SLO violation (s, p95 > 0.35 s)"),
    ("pressure_s", "Pressure (s, CPU > 0.75 or throttling > 5%)"),
    ("p95_mean", "p95 mean (s)"),
    ("replica_minutes", "Replica-minutes (cost)"),
    ("correct_prov_pct", "Correct provisioning (%)"),
    ("under_prov_s", "Under-provisioned (s)"),
    ("over_prov_s", "Over-provisioned (s)"),
    ("scale_actions", "Scale actions"),
    ("llm_calls", "LLM calls"),
]


STUCK_RESULTS = os.path.join(HERE, "evaluation_results_stuck.csv")
STUCK_COLUMNS = [
    ("recovery_s", "Recovery after fault (s; p95 < 0.35 s held 60 s)"),
    ("slo_violation_after_fault_s", "SLO violation after fault (s)"),
    ("max_replicas_after_fault", "Max replicas after fault"),
    ("replica_minutes", "Replica-minutes (cost)"),
    ("scale_actions", "Scale actions"),
    ("incidents", "Agent incidents"),
    ("stable", "Verified STABLE"),
    ("llm_calls", "LLM calls"),
]


def table(df, columns=COLUMNS):
    labels = [l for l in ORDER if l in set(df["label"])] + sorted(set(df["label"]) - set(ORDER))
    lines = ["| Metric | " + " | ".join(f"{l} (n={int((df['label'] == l).sum())})" for l in labels) + " |",
             "|---|" + "---|" * len(labels)]
    for col, name in columns:
        cells = []
        for l in labels:
            raw = df.loc[df["label"] == l, col] if col in df else pd.Series(dtype=object)
            never = int((raw.astype(str) == "never").sum())
            v = pd.to_numeric(raw, errors="coerce").dropna()
            if never:
                cells.append(f"never ({never}/{len(raw)})" + (f", else {v.mean():.3g}" if len(v) else ""))
            elif v.empty:
                cells.append("–")
            elif len(v) == 1:
                cells.append(f"{v.iloc[0]:g}")
            else:
                cells.append(f"{v.mean():.3g} ± {v.std():.2g}")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def timelines(df, out_name="comparison_timelines.png", stuck=False):
    runs = df.reset_index(drop=True)
    fig, axes = plt.subplots(len(runs), 1, figsize=(11, 2.3 * len(runs)), sharex=True, squeeze=False)
    for i, r in runs.iterrows():
        start = datetime.strptime(r["start"], "%Y-%m-%d %H:%M:%S").timestamp()
        end = datetime.strptime(r["end"], "%Y-%m-%d %H:%M:%S").timestamp()
        s = {k: fetch(QUERIES[k], start, end) for k in ["desired_replicas", "throughput", "latency_p95"]}
        ax = axes[i][0]
        t = sorted(s["desired_replicas"])
        minutes = [(x - start) / 60 for x in t]
        ax.step(minutes, [s["desired_replicas"][x] for x in t], where="post", color="#1f4e79", lw=2, label="replicas")
        ax.set_ylim(0, 3.6)
        ax.set_yticks([1, 2, 3])
        ax.set_ylabel("replicas")
        ax2 = ax.twinx()
        tr = sorted(s["throughput"])
        ax2.plot([(x - start) / 60 for x in tr], [s["throughput"][x] for x in tr], color="#8a8a8a", lw=1, label="rps")
        ax2.set_ylim(0, 35)
        ax2.set_ylabel("rps")
        bad = [(x - start) / 60 for x, v in s["latency_p95"].items() if v == v and v > SLO_P95]
        for b in bad:
            ax.axvspan(b, b + 10 / 60, color="#d62728", alpha=0.25, lw=0)
        if stuck:
            ax.axvline(float(r["fault_at_min"]), color="black", ls="--", lw=1)
            ax2.set_ylim(0, 12)
            ax.set_title(f"{r['label']}  ({r['start'][5:16]})  fault at {r['fault_at_min']} min, recovery "
                         f"{r['recovery_s']} s, max {r['max_replicas_after_fault']} replicas", fontsize=9, loc="left")
        else:
            ax.set_title(f"{r['label']}  ({r['start'][5:16]})  SLO violation {r['slo_violation_s']} s, "
                         f"{r['replica_minutes']} replica-min, {r['correct_prov_pct']}% correct", fontsize=9, loc="left")
    axes[-1][0].set_xlabel("minutes since load start (red = p95 > 0.35 s" + (", dashed = fault)" if stuck else ")"))
    fig.tight_layout()
    out = os.path.join(HERE, out_name)
    fig.savefig(out, dpi=110)
    return out


def main():
    df = pd.read_csv(RESULTS)
    df = df[~df["label"].str.contains("INVALID")]  # contaminated runs stay in the CSV for the record
    md = ["# Scaling strategy comparison (baseline.js, 5→20→30→14→5 VUs)", "",
          f"Generated {datetime.now():%Y-%m-%d %H:%M} from `evaluation_results.csv` ({len(df)} runs).", "",
          table(df), "",
          "Lower is better except correct provisioning. `llm` rows with notes mentioning an older agent version are",
          "kept for history; see the notes column in the CSV.", ""]
    if os.path.exists(STUCK_RESULTS):
        st = pd.read_csv(STUCK_RESULTS)
        st = st[~st["label"].str.contains("INVALID")]
        md += ["# Stuck-dependency fault (fault_load.js, 8 VUs; POST /chaos/stuck at t = 4 min)", "",
               f"{len(st)} runs from `evaluation_results_stuck.csv`. Only a restart fixes the fault; "
               "adding replicas dilutes it.", "", table(st, STUCK_COLUMNS), ""]
    with open(os.path.join(HERE, "comparison.md"), "w") as f:
        f.write("\n".join(md))
    print("\n".join(md))
    print("timelines:", timelines(df))
    if os.path.exists(STUCK_RESULTS) and len(st):
        print("stuck timelines:", timelines(st, "comparison_stuck_timelines.png", stuck=True))


if __name__ == "__main__":
    main()
