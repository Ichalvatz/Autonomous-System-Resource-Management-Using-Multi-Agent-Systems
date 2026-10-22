"""
Figure for the thesis: the detector on live traffic (detector validation run 2, 2026-09-30, quiet host).

k6 drove the demo states one after another and the replica count was set by hand at each phase boundary
(4-load-testing/detector_validation.sh); the detector ran in --dry-run (no agent). Top: the One-Class SVM
score of every evaluated reading (below 0 = anomaly) and the moments it would have woken the agent
(3 anomalous readings in a row, then a 60 s cooldown). Bottom: the load and the replica count.

Data: 4-load-testing/archive/detector_validation_phase1/detector_validation_readings_run2.csv and detector_validation_phases.csv (the same files
analyze_validation.py summarises). Run from the repo root:  .venv/bin/python3 thesis_notes/figures/make_validation_timeline.py
"""
import os

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LT = os.path.join(ROOT, "4-load-testing", "archive", "detector_validation_phase1")  # moved 2026-10-22
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "detector_validation_timeline.png")
VUS = {"A": 5, "B": 20, "C": 20, "D": 30, "E": 30, "F": 14, "G": 14, "H": 5, "I": 5}  # detector_validation.js

readings = pd.read_csv(os.path.join(LT, "detector_validation_readings_run2.csv"))
phases = pd.read_csv(os.path.join(LT, "detector_validation_phases.csv"))
seconds = lambda hms: sum(int(p) * f for p, f in zip(hms.split(":"), (3600, 60, 1)))
t0 = seconds(phases["time"].iloc[0])
readings["m"] = readings["timestamp"].map(seconds).sub(t0) / 60
phases["m"] = phases["time"].map(seconds).sub(t0) / 60
end = readings["m"].max() + 0.2
phases["end"] = list(phases["m"].iloc[1:]) + [end]

INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
BLUE, RED, TINT = "#2a78d6", "#c8432f", "#f6e7e1"
plt.rcParams.update({"font.size": 10, "axes.edgecolor": INK2, "axes.labelcolor": INK2,
                     "xtick.color": INK2, "ytick.color": INK2, "text.color": INK})
fig, (top, bottom) = plt.subplots(2, 1, figsize=(11, 6.2), sharex=True, gridspec_kw={"height_ratios": [2.2, 1.2]})

for _, p in phases.iterrows():
    anomaly = p["expected"] != "normal"
    for ax in (top, bottom):
        if anomaly:
            ax.axvspan(p["m"], p["end"], color=TINT, lw=0, zorder=0)
        ax.axvline(p["m"], color=GRID, lw=0.8, zorder=0)
    kind = p["expected"].replace("ANOMALY ", "")
    top.text((p["m"] + p["end"]) / 2, 0.235, f"{p['phase']}\n{p['replicas']} pod{'s' if p['replicas'] > 1 else ''}, "
             f"{VUS[p['phase']]} VU\n{kind}", ha="center", va="top", fontsize=7.5,
             color=RED if anomaly else INK2, fontweight="bold" if anomaly else "normal")
    wakes = readings[(readings["m"] >= p["m"]) & (readings["m"] < p["end"]) & readings["would_trigger"]]
    if anomaly and len(wakes):
        first = (wakes["m"].iloc[0] - p["m"]) * 60
        top.text((p["m"] + p["end"]) / 2, -0.43, f"woke after\n{first:.0f} s", ha="center", fontsize=7.5, color=INK)

normal = readings[readings["prediction"] == 1]
flagged = readings[readings["prediction"] == -1]
top.plot(readings["m"], readings["score"], color=BLUE, lw=1, alpha=0.6, zorder=2)
top.scatter(normal["m"], normal["score"], s=9, color=BLUE, zorder=3, label="normal reading")
top.scatter(flagged["m"], flagged["score"], s=12, color=RED, zorder=3, label="anomalous reading")
wake = readings[readings["would_trigger"]]
top.scatter(wake["m"], [0.11] * len(wake), marker="v", s=40, color=INK, zorder=4, label="would wake the agent")
top.axhline(0, color=INK2, lw=1, ls=(0, (4, 3)))
top.set_ylim(-0.48, 0.24)
top.set_ylabel("One-Class SVM score", color=INK)
top.legend(loc="lower left", frameon=False, fontsize=8, ncol=3, bbox_to_anchor=(0, -0.02))
top.grid(axis="y", color=GRID, lw=0.8)

bottom.plot(readings["m"], readings["throughput"], color=INK2, lw=1.4)
bottom.set_ylabel("rps", color=INK)
bottom.set_ylim(0, 30)
right = bottom.twinx()
right.step(readings["m"], readings["active_replicas"], where="post", color=BLUE, lw=2)
right.set_ylim(0, 3.6)
right.set_yticks([1, 2, 3])
right.set_ylabel("pods", color=BLUE)
right.tick_params(axis="y", colors=BLUE)
bottom.set_xlabel("minutes since the start of the validation run (shaded = phases that should wake the agent)")
for ax in (top, bottom, right):
    ax.spines["top"].set_visible(False)
top.spines["right"].set_visible(False)
bottom.spines["right"].set_visible(False)

fig.suptitle("Live traffic: every overload and waste phase woke the agent within 53–76 s; normal phases stayed quiet",
             x=0.01, ha="left", fontsize=12, color=INK)
fig.tight_layout(rect=(0, 0, 1, 0.96))
fig.savefig(OUT, dpi=200)
print(OUT)
