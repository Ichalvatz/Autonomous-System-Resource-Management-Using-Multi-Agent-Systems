"""
Measurement noise of a reading made only of data since a change (A32.1, 2026-11-02), in the units of the health model's
score, for the rule that judges a change: the verification of an action and the detector's follow of a pod-count change
(health_model.judge_trajectory). Such a reading's window starts where the change took effect and grows from 20 s to
1 min (nfr_metrics.clean_window); the fewer requests in it, the noisier it is. So a change between two readings counts
only when it is larger than the noise of that very comparison at that very time after a change.

Source: the HPA runs of the fault scenarios (stuck, cpuhog), from 4 min after the fault (the HPA has settled) to the end:
a steady anomalous state and no agent. A pseudo change every 30 s; readings at +20 ... +120 s with the window since it.
  step[t]  95th percentile of |score(t) - score(t - 10 s)|   ("worse": a fall larger than this)
  span[t]  95th percentile of |score(t) - score(t - 30 s)|   ("not improving": no rise larger than this)
over pairs of anomalous readings at the same pod count (a healthy reading is STABLE and never compared). From +60 s the
window is the usual minute and slides, so the values settle; past +120 s the +120 s values apply.
(Until A32.1 one noise, the bundle's noise_eps: the 95th percentile of the change between consecutive 1 m readings of the
healthy ramps of the training data, 0.142.)

Prometheus keeps 10 days, so every reading used is kept in window_noise_readings.json and the script reruns from it.
Run it again after retraining the model: the score is the model's.

Usage (repo root):  .venv/bin/python3 5-ml-training/measure_window_noise.py   -> 5-ml-training/window_noise.json
"""
import glob
import json
import os
import sys
from datetime import datetime

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "3-ai-agent"))
import health_model as hm  # noqa: E402
import nfr_metrics as nm  # noqa: E402

OUT = os.path.join(HERE, "window_noise.json")
READINGS = os.path.join(HERE, "window_noise_readings.json")
SETTLED_AFTER_FAULT_S = 240     # the HPA has made its change(s) by then (it scales at +20-30 s, A27-A31)
PSEUDO_EVERY_S = 30
OFFSETS = list(range(nm.MIN_CLEAN_SECONDS, 130, nm.SCRAPE_SECONDS))     # +20 ... +120 s
SPAN_READINGS = 3                                                       # = judge_trajectory's stuck_readings


def ts(text):
    return datetime.strptime(text.strip(), "%Y-%m-%d %H:%M:%S").timestamp()


def runs():
    """(run dir, start of the steady part, end of it) for every HPA fault run."""
    out = []
    for d in sorted(glob.glob(os.path.join(REPO, "4-load-testing", "eval_*_hpa_*"))):
        if not os.path.exists(os.path.join(d, "fault_at.txt")):
            continue
        end = ts(open(os.path.join(d, "window.txt")).readlines()[1])
        out.append((os.path.basename(d), ts(open(os.path.join(d, "fault_at.txt")).read()) + SETTLED_AFTER_FAULT_S, end))
    return out


def main():
    bundle = hm.load(os.path.join(HERE, "health_model.pkl"), window_noise=False)
    cache = json.load(open(READINGS)) if os.path.exists(READINGS) else {}
    step = {t: [] for t in OFFSETS[1:]}
    span = {t: [] for t in OFFSETS[SPAN_READINGS:]}
    used, sequences = [], 0
    for run, a, b in runs():
        t0, n_run = a, 0
        while t0 + OFFSETS[-1] <= b:
            seq = {}
            for off in OFFSETS:
                key = f"{int(t0 + off)}:{min(off, nm.WINDOW_SECONDS)}"
                if key not in cache:
                    cache[key] = nm.fetch_reading(window=nm.clean_window(off), at=int(t0 + off))
                r = cache[key]
                if r is not None:
                    seq[off] = (hm.score(bundle, r), r["replicas"])
            for off, (s, reps) in seq.items():
                for table, back in ((step, nm.SCRAPE_SECONDS), (span, SPAN_READINGS * nm.SCRAPE_SECONDS)):
                    prev = seq.get(off - back)
                    if off in table and prev and s < 0 and prev[0] < 0 and reps == prev[1]:
                        table[off].append(abs(s - prev[0]))
            n_run += bool(seq)
            t0 += PSEUDO_EVERY_S
        if n_run:
            used.append(run)
            sequences += n_run
    json.dump(cache, open(READINGS, "w"))
    p95 = lambda table: {str(t): round(float(np.percentile(v, 95)), 4) for t, v in table.items() if v}
    result = {
        "created": datetime.now().isoformat(timespec="seconds"),
        "model_trained_at": bundle.get("trained_at"), "gamma": bundle["gamma"],
        "step": p95(step), "span": p95(span),
        "n_step": {str(t): len(v) for t, v in step.items()}, "n_span": {str(t): len(v) for t, v in span.items()},
        "sequences": sequences, "runs": used,
        "definition": "95th percentile of |score change| between readings of a window starting at a (pseudo) change, "
                      "steady anomalous HPA fault runs; step = 10 s apart, span = 30 s apart; key = seconds since "
                      "the change of the later reading",
    }
    json.dump(result, open(OUT, "w"), indent=1)
    print(f"{sequences} sequences from {len(used)} HPA runs -> {OUT}")
    for name in ("step", "span"):
        print(f"  {name}: " + "  ".join(f"+{t}s {v:.3f}" for t, v in result[name].items()))


if __name__ == "__main__":
    main()
