"""
Figure for the thesis: why Isolation Forest was replaced by a One-Class SVM.

Scores of both models (2-replica model, same healthy training data) while ONE thing changes:
  left:  throughput (CPU per pod follows it at the healthy cost per request), latency/throttling healthy
  right: p95 latency, at mid-band throughput
Isolation Forest: plain, on the 4 raw features, trained here on baseline_metrics_healthy_filtered.csv
(the original script was deleted on 2026-09-30; this re-creates the "plain per-replica" variant tested then).
One-Class SVM: the deployed model from 5-ml-training/health_model.pkl.
Both: decision_function, > 0 = normal, < 0 = anomaly.

Run from the repo root:  .venv/bin/python3 thesis_notes/figures/make_if_vs_ocsvm.py
"""
import os
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.ensemble import IsolationForest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "if_vs_ocsvm_scores.png")
REPLICAS = 2  # the scale-down 2->1 of the demo lives here; the IF missed this waste in 18/20 seeds
CPU_PER_REQUEST = 0.073   # core-s, median of the healthy data (cpu * replicas / rps)
HEALTHY_P95, HEALTHY_THR = 0.10, 0.03

bundle = joblib.load(os.path.join(ROOT, "5-ml-training", "health_model.pkl"))
features = bundle["features"]  # ['avg_cpu_per_pod', 'latency_p95', 'cpu_throttling', 'throughput']
ocsvm = bundle["models"][REPLICAS]
data = pd.read_csv(os.path.join(ROOT, "5-ml-training", "baseline_metrics_healthy_filtered.csv"))
train = data[data["active_replicas"] == REPLICAS][features]
# contamination = nu of the One-Class SVM (0.02): same share of healthy training readings left outside.
iforest = IsolationForest(n_estimators=200, contamination=0.02, random_state=42).fit(train)

lo, hi = train["throughput"].min(), train["throughput"].max()
mid_rps = float(np.sqrt(lo * hi))


def frame(rps, p95):
    rps, p95 = np.broadcast_arrays(np.asarray(rps, float), np.asarray(p95, float))
    return pd.DataFrame({"avg_cpu_per_pod": CPU_PER_REQUEST * rps / REPLICAS, "latency_p95": p95,
                         "cpu_throttling": HEALTHY_THR, "throughput": rps})[features]


# The rps sweep stops where CPU per pod reaches the 1-core limit (2 pods x 1 core / 0.073 core-s = 27.4 rps):
# beyond it the swept state cannot exist. (Until 2026-10-21 it ran to 40 rps and the flat part was labelled
# "all overload", which it is not: latency and throttling stay healthy in this sweep.)
RPS_MAX = REPLICAS * 1.0 / CPU_PER_REQUEST
sweeps = {
    "rps": (np.linspace(3, RPS_MAX, 300), lambda x: frame(x, HEALTHY_P95)),
    "p95": (np.geomspace(0.05, 5, 300), lambda x: frame(mid_rps, x)),
}
scores = {(m, s): model.decision_function(make(x))
          for m, model in [("IF", iforest), ("OCSVM", ocsvm)] for s, (x, make) in sweeps.items()}
# Real overload moves every metric at once (CPU, latency, throttling and load): the Isolation Forest catches
# it (20/20 seeds), because clamped to the edges it lands in the rare "everything at its maximum" corner.
REAL_OVERLOAD = pd.DataFrame([{"avg_cpu_per_pod": 0.90, "latency_p95": 0.50, "cpu_throttling": 0.08,
                               "throughput": 24.0}])[features]
overload_score = {m: float(model.decision_function(REAL_OVERLOAD)[0])
                  for m, model in [("IF", iforest), ("OCSVM", ocsvm)]}

# --- style: reference palette slots 1-2 (validated), neutral ink for text
INK, INK2, GRID, BAND = "#0b0b0b", "#52514e", "#e4e3df", "#efeeea"
COLOR = {"IF": "#eb6834", "OCSVM": "#2a78d6"}
NAME = {"IF": "Isolation Forest", "OCSVM": "One-Class SVM"}
plt.rcParams.update({"font.size": 10, "axes.edgecolor": INK2, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK})

fig, axes = plt.subplots(2, 2, figsize=(10.5, 6.2), sharex="col")
for row, m in enumerate(["IF", "OCSVM"]):
    for col, s in enumerate(["rps", "p95"]):
        ax = axes[row][col]
        x, _ = sweeps[s]
        y = scores[(m, s)]
        if s == "rps":
            ax.axvspan(lo, hi, color=BAND, lw=0, zorder=0)
        else:
            ax.axvspan(train["latency_p95"].min(), train["latency_p95"].max(), color=BAND, lw=0, zorder=0)
            ax.set_xscale("log")
        ax.axhline(0, color=INK2, lw=1, ls=(0, (4, 3)), zorder=1)
        ax.plot(x, y, color=COLOR[m], lw=2, zorder=3)
        ax.grid(axis="y", color=GRID, lw=0.8)
        for side in ["top", "right"]:
            ax.spines[side].set_visible(False)
        pad = 0.15 * (y.max() - y.min())
        low = min(y.min(), 0, overload_score[m] if s == "rps" else 0)
        ax.set_ylim(low - (2 if (m, s) == ("IF", "rps") else 1) * pad, max(y.max(), 0) + pad)
        if s == "rps":
            ax.plot([24], [overload_score[m]], marker="D", ms=6, color=INK, zorder=4, ls="none")
        ax.set_ylabel(f"{NAME[m]}\nscore", color=INK)
        left = (m, s) == ("IF", "rps")  # the right corner of that panel holds the real-overload marker
        ax.text(0.01 if left else 0.99, 0.04, "anomaly below the dashed line", transform=ax.transAxes,
                ha="left" if left else "right", fontsize=8, color=INK2)

# annotations: the flat edges of the Isolation Forest
arrow = dict(arrowstyle="-", color=INK2, lw=0.8)
ax = axes[0][0]
x, _ = sweeps["rps"]
y = scores[("IF", "rps")]
flat = y[np.argmin(abs(x - 25))]
ax.text(3, 0.45 * flat, "waste: one fixed score,\nabove 0 = \"normal\" (missed)", fontsize=8, color=INK, va="center")
ax.annotate("more load, latency and\nthrottling still healthy:\none fixed score (normal)", xy=(25.5, flat),
            xytext=(21.9, 0.62 * y.max()), fontsize=8, color=INK, arrowprops=arrow)
ax.annotate("real overload (all metrics\nhigh): below 0, caught", xy=(24, overload_score["IF"]),
            xytext=(11.5, 0.45 * overload_score["IF"]), fontsize=8, color=INK, va="center", arrowprops=arrow)
ax.text(lo + 0.4, ax.get_ylim()[1], "healthy training range", fontsize=8, color=INK2, va="top")
axes[1][0].annotate("real overload", xy=(24, overload_score["OCSVM"]), xytext=(15.5, overload_score["OCSVM"] - 0.05),
                    fontsize=8, color=INK, va="center", arrowprops=arrow)
ax = axes[0][1]
x, _ = sweeps["p95"]
y = scores[("IF", "p95")]
ax.annotate("p95 0.2 s ... 5 s: one fixed score,\nstill above 0 = \"normal\"", xy=(2, y[np.argmin(abs(x - 2))]),
            xytext=(0.35, 0.55 * y.max()), fontsize=8, color=INK, arrowprops=arrow)

axes[1][0].set_xlabel("throughput (rps), 2 replicas: CPU per pod follows the load, up to its 1-core limit")
axes[1][1].set_xlabel("p95 latency (s, log scale), at mid-band load")
fig.suptitle("Scores while one metric moves out of the healthy range (2-replica model; ◆ = real overload, every metric high)",
             x=0.01, ha="left", fontsize=12, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(OUT, dpi=200)
print(OUT)

# numbers for the text
for m in ["IF", "OCSVM"]:
    x, make = sweeps["rps"]
    probe = {r: round(float(dict(IF=iforest, OCSVM=ocsvm)[m].decision_function(make(np.array([r])))[0]), 3)
             for r in [8, 12, 16.5, lo, mid_rps, hi, 35]}
    x, make = sweeps["p95"]
    lat = {p: round(float(dict(IF=iforest, OCSVM=ocsvm)[m].decision_function(make(np.array([p])))[0]), 3)
           for p in [0.1, 0.19, 0.4, 0.5, 2, 5]}
    print(m, "rps:", {round(k, 1): v for k, v in probe.items()}, "| p95:", lat)
print(f"healthy band rps {lo:.1f}-{hi:.1f}, p95 {train['latency_p95'].min():.3f}-{train['latency_p95'].max():.3f}, n={len(train)}")
