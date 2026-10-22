"""
Figure for the thesis: one One-Class SVM per replica count, and the load band each one accepts.

The deployed models (5-ml-training/phase1/health_model.pkl) scored while the load changes, with CPU per pod
following it at the healthy cost per request (0.073 core-s) and healthy latency / throttling (0.10 s, 3%).
Each curve stops where CPU per pod would pass the 1-core limit. Where a curve is above 0 that pod count is
"normal" for that load; the bands of neighbouring counts overlap, which is the anti-flapping deadband:
after a scale-down the smaller count already sees the load as normal.

Run from the repo root (read-only, a few seconds):  .venv/bin/python3 thesis_notes/figures/make_ocsvm_bands.py
"""
import os

import joblib
import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocsvm_bands_per_replica.png")
CPU_PER_REQUEST = 0.073
HEALTHY_P95, HEALTHY_THR = 0.10, 0.03
MIN_THROUGHPUT_RPS = 0.8  # the detector's low-traffic gate

bundle = joblib.load(os.path.join(ROOT, "5-ml-training", "phase1", "health_model.pkl"))
features = bundle["features"]


def scores(replicas, rps):
    x = pd.DataFrame({"avg_cpu_per_pod": CPU_PER_REQUEST * rps / replicas, "latency_p95": HEALTHY_P95,
                      "cpu_throttling": HEALTHY_THR, "throughput": rps})[features]
    return bundle["models"][replicas].decision_function(x)


curves, bands = {}, {}
for r in (1, 2, 3):
    rps = np.linspace(0.3, min(30.0, r * 1.0 / CPU_PER_REQUEST), 2000)
    s = scores(r, rps)
    curves[r] = (rps, s)
    normal = rps[s > 0]
    bands[r] = (float(normal.min()), float(normal.max()))

INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
COLOR = {1: "#9ec5f0", 2: "#4a90d9", 3: "#1b4f8f"}  # one hue, ordered by pod count
plt.rcParams.update({"font.size": 10, "axes.edgecolor": INK2, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK})
fig, (top, bottom) = plt.subplots(2, 1, figsize=(10.5, 6.4), sharex=True, gridspec_kw={"height_ratios": [3, 1.3]})

for r, (rps, s) in curves.items():
    top.plot(rps, s, color=COLOR[r], lw=2.2, label=f"{r} pod{'s' if r > 1 else ''}")
top.axhline(0, color=INK2, lw=1, ls=(0, (4, 3)))
top.axvline(MIN_THROUGHPUT_RPS, color=INK2, lw=0.8, ls=":")
top.text(MIN_THROUGHPUT_RPS + 0.25, 0.195, "below 0.8 rps the\ndetector does not judge", fontsize=8, color=INK2, va="top")
top.set_ylim(-0.6, 0.2)
top.set_ylabel("One-Class SVM score", color=INK)
top.text(29.8, -0.57, "anomaly below the dashed line", fontsize=8, color=INK2, ha="right")
top.legend(loc="lower center", frameon=False, ncol=3)
top.grid(axis="y", color=GRID, lw=0.8)

for i, r in enumerate((1, 2, 3)):
    lo, hi = bands[r]
    y = 3 - i
    bottom.plot([lo, hi], [y, y], color=COLOR[r], lw=9, solid_capstyle="butt")
    bottom.text(lo - 0.3, y, f"{lo:.1f}", ha="right", va="center", fontsize=8.5, color=INK)
    bottom.text(hi + 0.3, y, f"{hi:.1f} rps", ha="left", va="center", fontsize=8.5, color=INK)
bottom.set_yticks([3, 2, 1])
bottom.set_yticklabels(["1 pod", "2 pods", "3 pods"])
bottom.set_ylim(0.4, 3.6)
bottom.set_xlabel("throughput (rps); CPU per pod follows the load, latency and throttling healthy")
bottom.set_title("load each model calls normal (score > 0); the overlaps are the anti-flapping deadband",
                 fontsize=9, color=INK2, loc="left")
for ax in (top, bottom):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)

fig.suptitle("One model per pod count: each knows its own healthy load band, and neighbouring bands overlap",
             x=0.01, ha="left", fontsize=12, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(OUT, dpi=200)
print(OUT)
for r, (lo, hi) in bands.items():
    print(f"{r} pod(s): normal from {lo:.1f} to {hi:.1f} rps")
print(f"scale up 1->2 above {bands[1][1]:.1f}, down 2->1 below {bands[2][0]:.1f}; "
      f"up 2->3 above {bands[2][1]:.1f}, down 3->2 below {bands[3][0]:.1f}")
