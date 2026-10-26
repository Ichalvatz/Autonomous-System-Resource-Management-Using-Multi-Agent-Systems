"""
Offline replay of the v10 health model on recorded data, before any live run (design_decisions.md A28, acceptance
criteria 2-5). Uses the runtime's own code: the detector's gates and streak (anomaly_detector), the verification rule
(health_model.judge_trajectory with agent_tools' timings) and the agent's minimum pod count (agent._minimum_pods).

  2. Detector validation A-I (2026-10-23, dry run): the readings v9's detector evaluated
     (5-ml-training/v9/dry_run_readings_validation_2026-10-23.csv) and the phases (detector_validation_phases.csv).
  3. The valid runs of the campaign (results_nfr*.csv, notes = TAG): each run's series.json (10 s readings) through
     the detector logic: wake-ups after each fault, false wake-ups before a fault or in the first 5 min of the normal
     load, and the first wake-up of the normal load against v9's (controller.log).
  4. The verification of every action of the agent runs: the readings v9's verification logged in controller.log
     (every 10 s after the rollout), continued from series.json when v10 needs more.
  5. The minimum pod count (agent._minimum_pods) at every wake-up of the agent runs (incident_log.csv), with the
     load trend of the last minute from series.json, against the right action.

Usage (repo root):  .venv/bin/python3 4-load-testing/replay_model.py [TAG] > 4-load-testing/replay_v10.md
"""
import csv
import json
import os
import re
import sys
from datetime import datetime

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "3-ai-agent"))
os.environ.setdefault("GEMINI_API_KEY", "replay-makes-no-llm-calls")
import agent  # noqa: E402
import agent_tools  # noqa: E402
import anomaly_detector as ad  # noqa: E402
import health_model as hm  # noqa: E402

LT = os.path.join(ROOT, "4-load-testing")
VALIDATION_CSV = os.path.join(ROOT, "5-ml-training", "v9", "dry_run_readings_validation_2026-10-23.csv")
PHASES_CSV = os.path.join(LT, "detector_validation_phases.csv")
INCIDENTS = os.path.join(ROOT, "3-ai-agent", "incident_log.csv")
SCENARIOS = [("baseline", "results_nfr.csv"), ("stuck", "results_nfr_stuck.csv"), ("cpuhog", "results_nfr_cpuhog.csv")]
NORMAL_START_S = 300          # the first 5 min of the normal load: 42.8 rps on 1 pod, nothing to do
PHASE_LAG_S = 30              # a wake-up whose streak starts this soon after a phase change: the replica metric lag
VERIFY_LINE = re.compile(r"\+\s*(\d+)s score \S+ \((\d+) pod\(s\), ([\d.]+) rps \([\d.]+/pod\), p95 ([\d.]+) s, "
                         r"errors ([\d.]+)%\) -> (.+)$")
STAMP = re.compile(r"^\[(\d\d:\d\d:\d\d)\]")
BUNDLE = agent_tools._health_bundle()
EPS = float(BUNDLE["noise_eps"])


def ts(day, hms):
    return datetime.strptime(f"{day} {hms}", "%Y-%m-%d %H:%M:%S").timestamp()


def reading(throughput, p95, err, replicas, ready=None):
    return {"throughput": throughput, "latency_p95": p95, "error_rate": err or 0.0, "replicas": replicas,
            "rps_per_pod": throughput / max(replicas, 1), "ready_replicas": replicas if ready is None else ready}


def detector(points, gated=True):
    """Wake-ups of the detector logic over (t, reading or None) points: (wake time, streak start time) pairs."""
    wakes, streak, start, last_reps, changed_at, cooldown_until = [], 0, None, None, None, -1e18
    for t, r in points:
        if r is None:
            streak = 0
            continue
        if gated:
            if last_reps is not None and r["replicas"] != last_reps:
                changed_at = t
            last_reps = r["replicas"]
            if changed_at is not None and t - changed_at < ad.REPLICA_SETTLE_SECONDS:
                streak = 0
                continue
            if r["throughput"] < ad.MIN_THROUGHPUT_RPS:
                streak = 0
                continue
        if hm.score(BUNDLE, r) < 0:
            streak += 1
            start = t if streak == 1 else start
        else:
            streak = 0
        if streak >= ad.ANOMALY_STREAK_REQUIRED and t >= cooldown_until:
            wakes.append((t, start))
            streak = 0
            cooldown_until = t + ad.AGENT_COOLDOWN_SECONDS
    return wakes


def series_points(run_dir):
    s = json.load(open(os.path.join(ROOT, run_dir, "series.json")))
    out = []
    for t in sorted(int(k) for k in s["replicas"]):
        k = str(t)
        thr, p95, reps = s["throughput"].get(k), s["latency_p95"].get(k), s["replicas"].get(k)
        ok = all(v is not None and v == v for v in (thr, p95, reps)) and reps >= 1
        out.append((t, reading(thr, p95, s["error_rate"].get(k), reps, s["ready_replicas"].get(k)) if ok else None))
    return out


def trend_at(points, t):
    """rps per minute over the readings of the last minute before t (the detector's load_trend)."""
    hist = [(pt, r["throughput"]) for pt, r in points if r is not None and t - 60 <= pt <= t]
    return ad.load_trend(hist)


def valid_runs(tag):
    runs = []
    for scenario, name in SCENARIOS:
        with open(os.path.join(LT, name)) as f:
            for row in csv.DictReader(f):
                if row.get("notes") == tag and "INVALID" not in row["label"]:
                    runs.append((scenario, row["label"], row["run_dir"]))
    return runs


def run_info(run_dir):
    d = os.path.join(ROOT, run_dir)
    start, end = [x.strip() for x in open(os.path.join(d, "window.txt")).readlines()[:2]]
    fault = open(os.path.join(d, "fault_at.txt")).read().strip() if os.path.exists(os.path.join(d, "fault_at.txt")) else None
    fmt = "%Y-%m-%d %H:%M:%S"
    return (datetime.strptime(start, fmt).timestamp(), datetime.strptime(end, fmt).timestamp(),
            datetime.strptime(fault, fmt).timestamp() if fault else None, start[:10])


def v9_wakes(run_dir, day):
    path = os.path.join(ROOT, run_dir, "controller.log")
    if not os.path.exists(path):
        return []
    return [ts(day, m.group(1)) for line in open(path) if (m := STAMP.match(line))
            and ("ANOMALY DETECTED" in line or "RE-WAKE" in line)]


def verification_blocks(run_dir, day):
    """(actions, [(elapsed s, reading)], end time) for every verification in the run's controller.log."""
    lines = open(os.path.join(ROOT, run_dir, "controller.log")).read().splitlines()
    blocks, i = [], 0
    while i < len(lines):
        m = re.search(r"Actions (\[.*?\]) applied", lines[i])
        if not m:
            i += 1
            continue
        actions, readings, i = m.group(1), [], i + 1
        while i < len(lines) and not STAMP.match(lines[i]):
            v = VERIFY_LINE.search(lines[i])
            if v:
                readings.append((int(v.group(1)), reading(float(v.group(3)), float(v.group(4)), float(v.group(5)) / 100,
                                                          float(v.group(2)))))
            i += 1
        end = ts(day, STAMP.match(lines[i]).group(1)) if i < len(lines) else None
        blocks.append((actions, readings, end))
    return blocks


def judge(block_readings, end, points):
    """v10's verdict on one verification: (verdict, seconds after the rollout, readings used, from series)."""
    seq = list(block_readings)
    extra = [(t, r) for t, r in points if end is not None and t > end and r is not None]
    last = seq[-1][0] if seq else 0
    for k, (_, r) in enumerate(extra):
        seq.append((last + 10 * (k + 1), r))
    scores, full_at = [], None
    for k, (elapsed, r) in enumerate(seq):
        if elapsed > agent_tools.VERIFY_MAX_SECONDS:
            return "UNSTABLE: still anomalous after 4 min", elapsed, k, max(0, k - len(block_readings))
        scores.append(hm.score(BUNDLE, r))
        if full_at is None and elapsed >= agent_tools.VERIFY_WINDOW_FULL_SECONDS:
            full_at = k
        verdict = hm.judge_trajectory(scores, EPS, full_at)
        if verdict != "WAIT":
            return verdict, elapsed, k + 1, max(0, k + 1 - len(block_readings))
    return "WAIT (no more data)", seq[-1][0] if seq else 0, len(seq), 0


def main():
    tag = sys.argv[1] if len(sys.argv) > 1 else "campaign-2026-10-23"
    print(f"# Replay of the v10 health model ({tag})\n")
    print(f"*`replay_model.py`, {datetime.now():%Y-%m-%d %H:%M}. Model trained {BUNDLE.get('trained_at')}: gamma "
          f"{BUNDLE['gamma']}, weights {', '.join(f'{k} {v:g}' for k, v in BUNDLE['params'].items() if k.startswith('w_'))}; "
          f"noise_eps {EPS:.3f}; healthy bands (rps) {BUNDLE['bands']}.*\n")
    verdicts = {}

    # --- 2. detector validation A-I
    rows = list(csv.DictReader(open(VALIDATION_CSV)))
    phases = list(csv.DictReader(open(PHASES_CSV)))
    day = "2026-10-23"
    pstart = [(ts(day, p["time"]), p["phase"], p["expected"]) for p in phases]
    phase_of = lambda t: max((p for p in pstart if p[0] <= t), key=lambda p: p[0], default=(None, "-", ""))
    pts = [(ts(day, r["timestamp"]), reading(float(r["throughput"]), float(r["latency_p95"]), float(r["error_rate"]),
                                              float(r["replicas"]))) for r in rows]
    wakes = detector(pts, gated=False)     # the CSV holds only readings that passed the detector's gates
    v9 = [ts(day, r["timestamp"]) for r in rows if r["would_trigger"] == "True"]
    print("## 2. Detector validation A-I (live readings of 2026-10-23, dry run)\n")
    print("| Phase | Expected | v10 wake-ups (s after the phase start) | v9 wake-ups |\n|---|---|---|---|")
    false_normal, caught = 0, 0
    for t0, name, expected in pstart:
        w10 = [(w, s) for w, s in wakes if phase_of(w)[1] == name]
        w9 = [w for w in v9 if phase_of(w)[1] == name]
        lag = [(w, s) for w, s in w10 if s - t0 < PHASE_LAG_S]
        if expected == "normal":
            false_normal += len(w10) - len(lag)
        else:
            caught += bool(w10)
        cell = ", ".join(f"{w - t0:.0f}" + (" (lag)" if s - t0 < PHASE_LAG_S else "") for w, s in w10) or "none"
        print(f"| {name} | {expected} | {cell} | {', '.join(f'{w - t0:.0f}' for w in w9) or 'none'} |")
    anomalous = sum(p[2] != "normal" for p in pstart)
    verdicts["2. validation: 0 false wake-ups in normal phases"] = false_normal == 0
    verdicts[f"2. validation: {anomalous}/{anomalous} anomaly phases woken"] = caught == anomalous
    print(f"\nFalse wake-ups in normal phases (not counting the replica-metric lag): {false_normal}; anomaly phases "
          f"woken: {caught}/{anomalous}.\n")

    # --- 3. campaign runs through the detector
    runs = valid_runs(tag)
    print(f"## 3. Campaign runs through the detector ({len(runs)} valid runs)\n")
    print("| Run | Method | False wake-ups | v10 first wake-up | v9 first wake-up |\n|---|---|---|---|---|")
    false_total, faults_woken, faults, normal_ok, normal_n = 0, 0, 0, 0, 0
    run_points = {}
    for scenario, label, run_dir in runs:
        start, end, fault, day = run_info(run_dir)
        points = series_points(run_dir)
        run_points[run_dir] = (points, day, start, end)
        w10 = detector(points)
        w9 = v9_wakes(run_dir, day)
        if fault:
            false = [w for w, _ in w10 if w < fault]
            first10 = next((w for w, _ in w10 if w >= fault), None)
            first9 = next((w for w in w9 if w >= fault), None)
            faults += 1
            faults_woken += first10 is not None
            ref, what = fault, "after the fault"
        else:
            false = [w for w, _ in w10 if w < start + NORMAL_START_S]
            first10 = next((w for w, _ in w10 if w >= start + NORMAL_START_S), None)
            first9 = next((w for w in w9 if w >= start + NORMAL_START_S), None)
            ref, what = start, "after the start"
            if label != "hpa":
                normal_n += 1
                normal_ok += first10 is not None and first9 is not None and first10 <= first9
        false_total += len(false)
        fmt = lambda w: f"{w - ref:.0f} s {what}" if w is not None else "none"
        print(f"| {scenario} {os.path.basename(run_dir)[-13:]} | {label} | {len(false)} | {fmt(first10)} | "
              f"{fmt(first9) if label != 'hpa' else '(HPA run)'} |")
    verdicts["3. campaign: a wake-up after every fault"] = faults_woken == faults
    verdicts["3. campaign: false wake-ups <= 1 (v9's)"] = false_total <= 1
    verdicts["3. campaign: normal load, first wake-up not later than v9's"] = normal_ok == normal_n
    print(f"\nFaults woken: {faults_woken}/{faults}; false wake-ups: {false_total}; normal-load agent runs with the first "
          f"wake-up no later than v9's: {normal_ok}/{normal_n}. After a run's first wake-up the series holds what v9 or "
          "the HPA did, so later wake-ups are not compared.\n")

    # --- 4. verification of every action
    print("## 4. Verification of the agent's actions (v9's logged readings, then series.json)\n")
    print("| Run | Action | v9 | v10 | v10 at (s after the rollout) | readings from series |\n|---|---|---|---|---|---|")
    stable, actions_n = 0, 0
    for scenario, label, run_dir in runs:
        if label == "hpa":
            continue
        points, day, _, _ = run_points[run_dir]
        for actions, readings, end in verification_blocks(run_dir, day):
            actions_n += 1
            verdict, at, _, from_series = judge(readings, end, points)
            stable += verdict == "STABLE"
            print(f"| {scenario} {os.path.basename(run_dir)[-13:]} | {actions} | {readings[-1][0] if readings else '?'} s "
                  f"| {verdict} | {at} | {from_series} |")
    verdicts[f"4. verification: STABLE for all {actions_n} actions"] = stable == actions_n
    print(f"\nSTABLE: {stable}/{actions_n} (the v9 column is when v9's verification ended, all STABLE).\n")

    # --- 5. minimum pod count at every wake-up
    print("## 5. Minimum pod count at the agent's wake-ups (agent._minimum_pods)\n")
    print("| Woke at | State | Trend (rps/min) | v10 minimum | Right | |\n|---|---|---|---|---|---|")
    agree, n = 0, 0
    windows = [(run_points[d][2], run_points[d][3], d) for s, l, d in runs if l != "hpa"]
    for row in csv.DictReader(open(INCIDENTS)):
        t = datetime.strptime(row["woke_at"], "%Y-%m-%d %H:%M:%S").timestamp()
        run = next((d for a, b, d in windows if a <= t <= b), None)
        if run is None:
            continue
        points = run_points[run][0]
        rps, reps = float(row["throughput"]), int(round(float(row["replicas"])))
        trend = trend_at(points, t)
        need, _, _ = agent._minimum_pods(rps, trend)
        m = re.match(r"scale (\d+)->(\d+)", row["actions"] or "")
        right = int(m.group(2)) if m else reps        # a restart or no action: the minimum must equal the current
        ok = need == right
        agree += ok
        n += 1
        print(f"| {row['woke_at'][5:]} | {reps} pod(s), {rps:.0f} rps, p95 {float(row['latency_p95']):.2f} s, "
              f"errors {100 * float(row['error_rate'] or 0):.0f}% | {trend if trend is None else round(trend, 1)} | "
              f"{need} | {right} ({row['actions'] or 'no action'}) | {'✅' if ok else '❌'} |")
    verdicts[f"5. minimum pod count agrees with the right action at all {n} wake-ups"] = agree == n
    print(f"\nAgree: {agree}/{n}.\n")

    print("## Acceptance (A28, criteria 2-5)\n")
    for k, v in verdicts.items():
        print(f"- {'PASS' if v else '**FAIL**'}: {k}")


if __name__ == "__main__":
    main()
