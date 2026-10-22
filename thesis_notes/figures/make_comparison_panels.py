"""
Compact comparison figures for the meeting / thesis: a few panels cut from the full timeline figures.

Prometheus keeps 10 days, so the series of the runs up to 2026-10-04 cannot be redrawn; the full figures
(one panel per run) are kept in 4-load-testing/archive/timelines_until_2026-10-04/. The campaign of 2026-10-21/22
(every method the same night, agent v8.1) is kept the same way in archive/timelines_campaign-2026-10-21/.
This script cuts the panels of the chosen runs out of them (panels are found by the blank rows between them)
and stacks them, with the shared time axis of the original at the bottom. Each panel keeps its original title
(method, date, SLO violation / recovery, cost).

Run from the repo root (read-only):  .venv/bin/python3 thesis_notes/figures/make_comparison_panels.py
"""
import os

import matplotlib
import numpy as np
from PIL import Image

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARCHIVE = os.path.join(ROOT, "4-load-testing", "archive")
HERE = os.path.dirname(os.path.abspath(__file__))

FIGURES = [
    # source folder in the archive, source figure, panels (1-based, in the order to show), output, title
    ("timelines_until_2026-10-04", "comparison_timelines.png", [5, 21, 20, 18], "comparison_normal_load.png",
     "Normal load (5→20→30→14→5 users): static-1 breaks the SLO (red); HPA, rules and the agent keep it,\n"
     "and the agent uses the fewest replica-minutes"),
    ("timelines_until_2026-10-04", "comparison_badconfig_timelines.png", [3, 5, 2, 9], "comparison_badconfig.png",
     "Bad configuration change at minute 4 (dashed): HPA and rules add pods, rules v2 restarts 11 times;\n"
     "only the agent recovers, by rolling the change back"),
    # campaign 2026-10-21/22: static-1, hpa (the 09:39 rerun), rules, agent v8.1 05:00 / hpa, rules, rules-v2, agent 04:27
    ("timelines_campaign-2026-10-21", "comparison_timelines.png", [3, 8, 1, 5], "comparison_normal_load_2026-10-21.png",
     "Normal load, every method the same night (21-22/10): static-1 breaks the SLO (red); HPA, rules and the agent\n"
     "keep it; the agent and the rules cost the same, HPA about 10% more"),
    ("timelines_campaign-2026-10-21", "comparison_badconfig_timelines.png", [3, 2, 1, 4], "comparison_badconfig_2026-10-21.png",
     "Bad configuration change at minute 4 (dashed), the same night: HPA and rules add pods, rules v2 restarts\n"
     "11 times; only the agent recovers, by rolling the change back"),
]


def blocks(gray, min_gap=6):
    """(start, end) row ranges of non-blank content separated by at least min_gap blank rows."""
    ink = (gray < 200).sum(axis=1) > 0
    out, start, gap, end = [], None, 0, 0
    for y, has_ink in enumerate(ink):
        if has_ink:
            start = y if start is None else start
            gap, end = 0, y
        else:
            gap += 1
            if start is not None and gap >= min_gap:
                out.append((start, end))
                start = None
    if start is not None:
        out.append((start, end))
    return out


for folder, src, picks, out_name, title in FIGURES:
    img = Image.open(os.path.join(ARCHIVE, folder, src)).convert("RGB")
    rows = blocks(np.asarray(img.convert("L")))
    panels, axis_label = rows[:-1], rows[-1]          # the last block is the x-axis label
    height = min(b - a for a, b in panels[:-1]) + 1   # a panel without tick labels
    last_a, last_b = panels[-1]                        # the bottom panel also holds the tick labels
    ticks = img.crop((0, last_a + height, img.width, last_b + 1))
    # the strip also catches the bottom of the right axis' "0" label: blank the right margin
    ticks.paste((255, 255, 255), (int(0.9 * img.width), 0, img.width, ticks.height))
    label = img.crop((0, axis_label[0], img.width, axis_label[1] + 1))
    parts = [img.crop((0, a, img.width, a + height)) for a, _ in (panels[i - 1] for i in picks)] + [ticks, label]
    gap = 10
    stacked = Image.new("RGB", (img.width, sum(p.height for p in parts) + gap * len(picks) + 8), "white")
    y = 0
    for i, part in enumerate(parts):
        stacked.paste(part, (0, y))
        y += part.height + (gap if i < len(picks) else 8 if i == len(picks) else 0)
    dpi = 110  # the source figures were saved at 110 dpi
    fig = plt.figure(figsize=(stacked.width / dpi, stacked.height / dpi + 0.55), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, stacked.height / (stacked.height + 0.55 * dpi)])
    ax.imshow(stacked)
    ax.axis("off")
    fig.text(0.01, 0.995, title, ha="left", va="top", fontsize=10.5, color="#0b0b0b")
    out = os.path.join(HERE, out_name)
    fig.savefig(out, dpi=dpi * 2)
    plt.close(fig)
    print(out, f"({len(picks)} panels from {src})")
