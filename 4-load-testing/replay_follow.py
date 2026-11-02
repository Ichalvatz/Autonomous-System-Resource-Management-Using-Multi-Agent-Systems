"""
Offline check of A32 (2026-11-02): the detector no longer skips 90 s after a pod-count change. After the agent's
verified change the readings are judged as usual; a change no verification watched is followed with the verification's
own rule (health_model.follow_verdict). Compares v12's detector (90 s skipped from the first reading at the new count,
REPLICA_SETTLE_SECONDS) with the current one (v13; replay_model.detector) on recorded data, with the current health
model (v12's, gamma 0.1):

  1. After every scale action of the agent in phase 2 (every agent run with a series.json since 2026-10-23: the four
     campaigns, smoke and invalid runs, the UNSTABLE test of 2026-11-01): the readings v12 skipped, scored, and the
     first wake-up of each detector in the 150 s after the agent returned (3 in a row, 60 s cooldown from the return).
  2. Changes nobody verified: the live detector validations A-I, whose script scales by hand (26/10 v10, 27/10 v11,
     1/11 v12). The dry-run logs hold only the readings v12 evaluated, so the full series comes from Prometheus (10 days
     of retention; saved as detector_validation_series.json next to each validation's files). v12, v13, and no rule at
     all (every reading counted by the streak only) for reference.
  3. Every valid run of the four campaigns through both detectors: wake-ups before the fault (or in the first 5 min of
     the normal load) and the first wake-up after it. Only the runs where the two differ are listed.

Usage (repo root):  .venv/bin/python3 4-load-testing/replay_follow.py > 4-load-testing/replay_v13_follow.md
"""
import glob
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "4-load-testing"))
import replay_model as rm  # noqa: E402  (puts 3-ai-agent on the path; makes no LLM calls)
import anomaly_detector as ad  # noqa: E402
import health_model as hm  # noqa: E402
import nfr_metrics  # noqa: E402

V12_SKIP_SECONDS = 90         # v12's REPLICA_SETTLE_SECONDS
HORIZON_S = 150               # section 1: wake-ups this long after the agent returned
TAGS = ["campaign-2026-10-23", "campaign-2026-10-26", "campaign-2026-10-28", "campaign-2026-11-01"]
VALIDATIONS = [("2026-10-26", os.path.join(rm.LT, "archive", "detector_validation_v10"), "v10"),
               ("2026-10-27", os.path.join(rm.LT, "archive", "detector_validation_v11"), "v11"),
               ("2026-11-01", rm.LT, "v12")]
STAMP = re.compile(r"^\[(\d\d:\d\d:\d\d)\]")
B = rm.BUNDLE


def hms(t):
    return datetime.fromtimestamp(t).strftime("%H:%M:%S")


def detector_skip(points, skip_s, cooldown_until=-1e18):
    """v12's detector (skip_s = 90) or no rule at all (skip_s = 0): (wake time, streak start) pairs."""
    wakes, streak, start, last, changed, cool = [], 0, None, None, None, cooldown_until
    for t, r in points:
        if r is None:
            streak = 0
            continue
        if last is not None and r["replicas"] != last:
            changed = t
        last = r["replicas"]
        if changed is not None and t - changed < skip_s or r["throughput"] < ad.MIN_THROUGHPUT_RPS:
            streak = 0
            continue
        if hm.score(B, r) < 0:
            streak += 1
            start = t if streak == 1 else start
        else:
            streak = 0
        if streak >= ad.ANOMALY_STREAK_REQUIRED and t >= cool:
            wakes.append((t, start))
            streak = 0
            cool = t + ad.AGENT_COOLDOWN_SECONDS
    return wakes


def streak_wakes(points, cooldown_until):
    """v13 after a change its verification watched: every reading judged, 3 in a row, the cooldown."""
    return detector_skip(points, 0, cooldown_until)


def agent_runs(run_dir, day):
    """(wake, return, replicas before the wake, how it ended) for every agent run in a controller.log."""
    lines = open(os.path.join(ROOT, run_dir, "controller.log")).read().splitlines()
    runs, wake = [], None
    for line in lines:
        m = STAMP.match(line)
        if not m:
            continue
        if "ANOMALY DETECTED" in line or "RE-WAKE" in line:
            wake = rm.ts(day, m.group(1))
        elif wake and ("επιλύθηκε" in line or "δεν επιβεβαίωσε" in line or "ξαναξυπνά" in line):
            ended = "STABLE" if "επιλύθηκε" in line else "re-wake" if "ξαναξυπνά" in line else "not confirmed"
            runs.append((wake, rm.ts(day, m.group(1)), ended))
            wake = None
    return runs


def section1():
    print("## 1. After the agent's own scale actions (phase 2)\n")
    dirs = sorted(os.path.relpath(d, ROOT) for d in glob.glob(os.path.join(rm.LT, "eval_*llm_2026*"))
                  if os.path.basename(d).split("_")[-2] >= "20261023")
    dirs.append(os.path.relpath(os.path.join(rm.LT, "archive", "unstable_test_2026-11-01"), ROOT))
    rows, healthy, n = [], 0, 0
    for d in dirs:
        if not os.path.exists(os.path.join(ROOT, d, "series.json")):
            continue
        day = open(os.path.join(ROOT, d, "window.txt")).readline()[:10]
        pts = rm.series_points(d)
        for wake, ret, ended in agent_runs(d, day):
            before = [r for t, r in pts if r and t <= wake]
            after = [(t, r) for t, r in pts if t > ret]
            if not before or not after or after[0][1] is None or before[-1]["replicas"] == after[0][1]["replicas"]:
                continue                       # no pod-count change: v12 skipped nothing either
            if ended == "re-wake":
                continue                       # v12 skipped nothing on a re-wake either
            n += 1
            first = after[0][0]
            window = [(t, r) for t, r in after if r and t - first < V12_SKIP_SECONDS]
            scores = [hm.score(B, r) for _, r in window]
            horizon = [(t, r) for t, r in after if t - ret <= HORIZON_S]
            # v12 saw the change at the first reading after the return: a 0 rps reading at the return sets the old
            # count (skipped by the throughput gate, never scored).
            old_count = [(ret, {**before[-1], "throughput": 0.0})]
            w12 = detector_skip(old_count + horizon, V12_SKIP_SECONDS, ret + ad.AGENT_COOLDOWN_SECONDS)
            if ended == "STABLE":      # watched by the verification: judged as usual
                w13 = streak_wakes(horizon, ret + ad.AGENT_COOLDOWN_SECONDS)
            else:                      # not confirmed (none in phase 2): followed
                w13 = rm.detector(old_count + horizon)
            if min(scores) >= 0 and not w12 and not w13:
                healthy += 1
                continue
            worst = min(window, key=lambda x: hm.score(B, x[1]))[1]
            fmt = lambda w: f"+{w[0][0] - ret:.0f} s" if w else "none"
            rows.append(f"| {os.path.basename(d)} | {hms(ret)} | {before[-1]['replicas']:.0f}->"
                        f"{after[0][1]['replicas']:.0f} ({ended}) | " + " ".join(f"{s:+.2f}" for s in scores)
                        + f" | p95 {worst['latency_p95']:.3f} s at {worst['throughput']:.0f} rps | {fmt(w12)} | "
                        f"{fmt(w13)} |")
    print(f"{n} scale actions changed the pod count (re-wakes excluded: v12 skipped nothing there). In {healthy} of "
          "them every reading v12 skipped is healthy for the current model and neither detector wakes. The others:\n")
    print("| Run | Agent returned | Change | Scores in the 90 s v12 skipped | Worst reading | v12 wake-up | "
          "v13 wake-up |\n|---|---|---|---|---|---|---|")
    print("\n".join(rows) + "\n")


def validation_series(day, folder, phases):
    path = os.path.join(folder, "detector_validation_series.json")
    if not os.path.exists(path):
        t0 = rm.ts(day, phases[0]["time"])
        t1 = rm.ts(day, phases[-1]["time"]) + 240
        json.dump(nfr_metrics.fetch_range(int(t0), int(t1), step=10), open(path, "w"))
    s = json.load(open(path))
    out = []
    for k in sorted(s["replicas"], key=int):
        thr, p95, reps = s["throughput"].get(k), s["latency_p95"].get(k), s["replicas"].get(k)
        ok = all(v is not None and v == v for v in (thr, p95, reps)) and reps >= 1
        out.append((int(k), rm.reading(thr, p95, s["error_rate"].get(k), reps, s["ready_replicas"].get(k))
                    if ok else None))
    return out


def section2():
    import csv
    print("## 2. Changes nobody verified: the live detector validations A-I (the script scales by hand)\n")
    print("Wake-ups in seconds after the phase start; * = the streak started within 30 s of it (the previous phase "
          "still in the 1 m window, counted as lag as in replay_model.py); U = the follow ended UNSTABLE.\n")
    totals = {}
    for day, folder, version in VALIDATIONS:
        phases = list(csv.DictReader(open(os.path.join(folder, "detector_validation_phases.csv"))))
        pts = validation_series(day, folder, phases)
        pstart = [(rm.ts(day, p["time"]), p["phase"], p["expected"]) for p in phases]
        phase_of = lambda t: max((p for p in pstart if p[0] <= t), key=lambda p: p[0])
        res = {"v12": detector_skip(pts, V12_SKIP_SECONDS), "v13": rm.detector(pts), "no rule": detector_skip(pts, 0)}
        print(f"### {day} ({version} validation, {len(pts)} readings)\n")
        print("| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed) | no rule | Scores of the first 100 s |\n"
              "|---|---|---|---|---|---|---|")
        prev = None
        for (t0, name, exp), p in zip(pstart, phases):
            cells = []
            for m in ("v12", "v13", "no rule"):
                w = [(wt, st) for wt, st in res[m] if phase_of(wt)[1] == name]
                cells.append(", ".join(f"{wt - t0:.0f}{'*' if st - t0 < rm.PHASE_LAG_S else ''}" for wt, st in w)
                             or "none")
                false = sum(1 for wt, st in w if exp == "normal" and st - t0 >= rm.PHASE_LAG_S)
                caught = bool(w) and exp != "normal"
                tot = totals.setdefault(m, [0, 0, 0, 0])
                tot[0] += false
                tot[1] += caught
                tot[2] += exp != "normal"
                tot[3] += len(w) if exp == "normal" else 0
            changed = prev is not None and p["replicas"] != prev
            seq = " ".join(f"{hm.score(B, r):+.2f}" for t, r in pts if r and 0 <= t - t0 < 100) if changed else ""
            print(f"| {name} | {exp} | {prev + '->' if changed else ''}{p['replicas']} | " + " | ".join(cells)
                  + f" | {seq} |")
            prev = p["replicas"]
        print()
    for m, (false, caught, anomalous, normal_all) in totals.items():
        print(f"- {m}: false wake-ups in normal phases {false} (all wake-ups in normal phases, the * ones included: "
              f"{normal_all}); anomaly phases woken {caught}/{anomalous}")
    print()
    return totals


def section3():
    print("## 3. The campaigns' valid runs through both detectors\n")
    print("| Run | Method | Wake-ups before (v12 / v13) | First wake-up after (v12 / v13) | Pod-count changes before "
          "it |\n|---|---|---|---|---|")
    agent_same, agent_n, summary = 0, 0, []
    for tag in TAGS:
        diff = 0
        runs = rm.valid_runs(tag)
        for scenario, label, run_dir in runs:
            start, end, fault, day = rm.run_info(run_dir)
            pts = rm.series_points(run_dir)
            after = fault if fault else start + rm.NORMAL_START_S
            w12, w13 = detector_skip(pts, V12_SKIP_SECONDS), rm.detector(pts)
            f12, f13 = [w for w, _ in w12 if w < after], [w for w, _ in w13 if w < after]
            a12 = next((w for w, _ in w12 if w >= after), None)
            a13 = next((w for w, _ in w13 if w >= after), None)
            same = f12 == f13 and a12 == a13
            if label != "hpa":
                agent_n += 1
                agent_same += same
            if same:
                continue
            diff += 1
            last = max(x for x in (a12, a13, after) if x is not None)
            changes, prev = [], None
            for t, r in pts:
                if r is None or t > last:
                    continue
                if prev is not None and r["replicas"] != prev:
                    changes.append(f"{prev:.0f}->{r['replicas']:.0f} at {t - after:+.0f} s")
                prev = r["replicas"]
            what = "the fault" if fault else "the first 5 min"
            fmt = lambda w: f"{w - after:+.0f} s" if w is not None else "none"
            print(f"| {scenario} {os.path.basename(run_dir)[-13:]} ({tag[-5:]}) | {label} | {len(f12)} / {len(f13)} | "
                  f"{fmt(a12)} / {fmt(a13)} after {what} | {', '.join(changes) or '-'} |")
        summary.append(f"{tag}: {len(runs)} valid runs, {diff} differ")
    print("\n" + "; ".join(summary) + f". Agent runs with the same wake-ups: {agent_same}/{agent_n}. In the listed "
          "runs the HPA changed the pod count and nothing verified the change: v13 follows it and calls it UNSTABLE "
          "once the 1 m windows hold only post-change data and the score has not risen; v12 skipped 90 s and then "
          "needed 3 anomalous readings in a row.\n")
    return agent_same, agent_n


def main():
    print("# A32: the detector's follow of a pod-count change (v13) against v12's 90 s skip\n")
    print(f"*`replay_follow.py`, {datetime.now():%Y-%m-%d %H:%M}. Model {B['model_type']} trained "
          f"{B.get('trained_at')}: gamma {B['gamma']}, noise_eps {rm.EPS:.3f}. Detector: 3 anomalous readings in a "
          f"row, {ad.AGENT_COOLDOWN_SECONDS} s cooldown; the follow: health_model.follow_verdict ('worse' from "
          f"{hm.JUDGE_FROM_SECONDS} s, 'not improving' from {hm.WINDOW_FULL_SECONDS} s, still anomalous after "
          f"{hm.GIVE_UP_SECONDS} s).*\n")
    section1()
    totals = section2()
    same, n = section3()
    print("## Checks\n")
    v12, v13 = totals["v12"], totals["v13"]
    print(f"- validations: v13 false wake-ups in normal phases {v13[0]} (v12 {v12[0]}), all wake-ups in normal phases "
          f"{v13[3]} (v12 {v12[3]}, no rule {totals['no rule'][3]}), anomaly phases woken {v13[1]}/{v13[2]} "
          f"(v12 {v12[1]}/{v12[2]})")
    print(f"- campaigns: agent runs with the same wake-ups {same}/{n}")


if __name__ == "__main__":
    main()
