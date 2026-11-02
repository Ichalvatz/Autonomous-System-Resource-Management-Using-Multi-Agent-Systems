"""
Offline check of agent v13's detector and verification (A32, A32.1, 2026-11-02) against v12's, on recorded data, with
the current health model (v12's, gamma 0.1).
  v12: after a pod-count change the detector skipped 90 s (from the first reading after the agent returned); the
       verification judged the usual 1 m readings, "worse" from 10 s and "not improving" from 60 s after the rollout.
  v13: after a change every reading holds only data since it took effect (nfr_metrics.clean_window: from 20 s, the
       window growing to the usual minute); the verification and the detector's follow judge them with the user's rule
       and the measured noise of each comparison (health_model.judge_trajectory, window_noise.json); after the agent's
       verified change the detector judges at once, any other pod-count change is followed.

  1. The verification of every action in phase 2 (every agent run with a controller.log since 2026-10-23: the four
     campaigns, smoke and invalid runs, the UNSTABLE test of 2026-11-01): the recorded verdict (the rule of its time)
     against v13's on post-change readings; also with the rollout taken 3 s later (older logs give its time to ~2 s).
  2. The detector after every action the verification called STABLE: v12's and v13's first wake-up in the 150 s after
     the agent returned (60 s cooldown from the return).
  3. Changes nobody verified: the live detector validations A-I (the script scales by hand; 26/10, 27/10, 1/11).
  4. Every valid run of the four campaigns through both detectors: wake-ups before the fault (or in the first 5 min of
     the normal load) and the first one after it; only the runs where they differ.
Post-change readings come from Prometheus (10 days) and are kept in archive/clean_window_readings.json
(replay_model.clean_reading); without them an action is "no data". (A32's comparison, before A32.1, with the 1 m
readings: archive/a32_replay_follow/.)

Usage (repo root):  .venv/bin/python3 4-load-testing/replay_v13.py > 4-load-testing/replay_v13.md
"""
import csv
import glob
import os
import sys
from collections import Counter
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "4-load-testing"))
import replay_model as rm  # noqa: E402  (puts 3-ai-agent on the path; makes no LLM calls)
import anomaly_detector as ad  # noqa: E402
import health_model as hm  # noqa: E402
import nfr_metrics  # noqa: E402

V12_SKIP_SECONDS = 90         # v12's REPLICA_SETTLE_SECONDS
HORIZON_S = 150               # section 2: wake-ups this long after the agent returned
SHIFT_S = 3                   # section 1: the rollout taken this much later
TAGS = ["campaign-2026-10-23", "campaign-2026-10-26", "campaign-2026-10-28", "campaign-2026-11-01"]
VALIDATIONS = [("2026-10-26", os.path.join(rm.LT, "archive", "detector_validation_v10"), "v10"),
               ("2026-10-27", os.path.join(rm.LT, "archive", "detector_validation_v11"), "v11"),
               ("2026-11-01", rm.LT, "v12")]
B = rm.BUNDLE


def detector_v12(points, cooldown_until=-1e18):
    """v12's detector: 90 s skipped after a pod-count change, then 3 in a row, 60 s cooldown."""
    wakes, streak, start, last, changed, cool = [], 0, None, None, None, cooldown_until
    for t, r in points:
        if r is None:
            streak = 0
            continue
        if last is not None and r["replicas"] != last:
            changed = t
        last = r["replicas"]
        if changed is not None and t - changed < V12_SKIP_SECONDS or r["throughput"] < ad.MIN_THROUGHPUT_RPS:
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


def detector_v13_after_action(points, converged, cooldown_until):
    """v13's detector after a verified action: post-change readings until they are a minute long, then the series';
    3 in a row, the cooldown."""
    wakes, streak, cool = [], 0, cooldown_until
    for t, r in points:
        if t - converged < nfr_metrics.WINDOW_SECONDS:
            r = rm.clean_reading(converged, t)
        if r is None or r["throughput"] < ad.MIN_THROUGHPUT_RPS:
            streak = 0
            continue
        streak = streak + 1 if hm.score(B, r) < 0 else 0
        if streak >= ad.ANOMALY_STREAK_REQUIRED and t >= cool:
            wakes.append(t)
            streak = 0
            cool = t + ad.AGENT_COOLDOWN_SECONDS
    return wakes


def agent_dirs():
    dirs = sorted(os.path.relpath(d, ROOT) for d in glob.glob(os.path.join(rm.LT, "eval_*llm_2026*"))
                  if os.path.basename(d).split("_")[-2] >= "20261023")
    dirs.append(os.path.relpath(os.path.join(rm.LT, "archive", "unstable_test_2026-11-01"), ROOT))
    return [d for d in dirs if os.path.exists(os.path.join(ROOT, d, "controller.log"))
            and os.path.exists(os.path.join(ROOT, d, "window.txt"))]


def actions():
    """(run, day, actions, recorded verdict, recorded seconds, rollout converged, agent returned) for every action."""
    out = []
    for d in agent_dirs():
        day = open(os.path.join(ROOT, d, "window.txt")).readline()[:10]
        for acts, readings, recorded, converged, end in rm.verification_blocks(d, day):
            if converged is not None:
                out.append((d, day, acts, recorded.split(" (")[0] or "?", readings[-1][0] if readings else None,
                            converged, end))
    return out


def section1(all_actions):
    print("## 1. The verification of every action in phase 2\n")
    rows, times12, times13, kinds, shift_same, n = [], [], [], Counter(), 0, 0
    for d, day, acts, recorded, rec_s, converged, end in all_actions:
        verdict, at, _ = rm.judge(converged)
        if verdict == "no data":
            kinds["no data"] += 1
            continue
        n += 1
        shifted, _, _ = rm.judge(converged + SHIFT_S)
        shift_same += shifted.split(":")[0] == verdict.split(":")[0]
        v12, v13 = recorded.split(":")[0], verdict.split(":")[0]
        kinds[(v12, v13)] += 1
        if v12 == v13 == "STABLE":
            times12.append(rec_s)
            times13.append(at)
        else:
            rows.append(f"| {os.path.basename(d)} | {acts} | {recorded} at {rec_s} s | {verdict} at {at} s |")
    print(f"{n} actions with post-change readings ({kinds['no data']} without: Prometheus keeps 10 days).\n")
    print("| Recorded (the rule of its time) | v13 (post-change readings) | Actions |\n|---|---|---|")
    for k, v in sorted(((k, v) for k, v in kinds.items() if k != "no data"), key=lambda kv: -kv[1]):
        print(f"| {k[0]} | {k[1]} | {v} |")
    dist = lambda ts: ", ".join(f"{t} s: {c}" for t, c in sorted(Counter(ts).items()))
    print(f"\nSTABLE in both: seconds after the rollout, recorded: {dist(times12)}; v13: {dist(times13)}.\n")
    if rows:
        print("Every other action:\n\n| Run | Action | Recorded | v13 |\n|---|---|---|---|")
        print("\n".join(rows) + "\n")
    print(f"With the rollout taken {SHIFT_S} s later, the same verdict for {shift_same}/{n}.\n")
    return n, kinds, shift_same


def section2(all_actions):
    print("## 2. The detector after every action the verification called STABLE\n")
    rows, n, changed_count, data_n = [], 0, 0, 0
    for d, day, acts, recorded, rec_s, converged, end in all_actions:
        if not recorded.startswith("STABLE") or end is None or not os.path.exists(os.path.join(ROOT, d, "series.json")):
            continue
        try:
            pts = rm.series_points(d)
        except KeyError:
            continue
        horizon = [(t, r) for t, r in pts if end < t <= end + HORIZON_S]
        if not horizon:
            continue
        n += 1
        if rm.clean_reading(converged, converged + nfr_metrics.MIN_CLEAN_SECONDS) is None:
            continue
        data_n += 1
        before = [r for t, r in pts if r is not None and t <= converged - 30]
        pod_change = bool(before) and "->" in acts
        changed_count += pod_change
        # v12 saw a pod-count change at the first reading after the return: a 0 rps reading at the return sets the
        # old count (skipped by the throughput gate, never scored)
        old = [(end, {**before[-1], "throughput": 0.0})] if pod_change else []
        w12 = detector_v12(old + horizon, end + ad.AGENT_COOLDOWN_SECONDS)
        w13 = detector_v13_after_action(horizon, converged, end + ad.AGENT_COOLDOWN_SECONDS)
        if w12 or w13:
            fmt = lambda w: f"+{w[0] - end:.0f} s" if w else "none"
            worst = min((r for t, r in horizon if r), key=lambda r: hm.score(B, r))
            rows.append(f"| {os.path.basename(d)} | {acts} | {fmt([w for w, _ in w12])} | {fmt(w13)} | p95 "
                        f"{worst['latency_p95']:.2f} s at {worst['throughput']:.0f} rps ({worst['replicas']:.0f} pods) |")
    print(f"{n} STABLE actions with a series after them; {data_n} with post-change readings ({changed_count} changed "
          f"the pod count). Wake-ups in the {HORIZON_S} s after the agent returned:\n")
    print("| Run | Action | v12 | v13 | Worst 1 m reading (series) |\n|---|---|---|---|---|")
    print("\n".join(rows) if rows else "| (none) | | | | |")
    print()
    return data_n, rows


def section3():
    print("## 3. Changes nobody verified: the live detector validations A-I (the script scales by hand)\n")
    print("Wake-ups in seconds after the phase start; * = the streak started within 30 s of it (the previous phase).\n")
    totals = {}
    for day, folder, version in VALIDATIONS:
        phases = list(csv.DictReader(open(os.path.join(folder, "detector_validation_phases.csv"))))
        pts = rm.series_points(os.path.relpath(folder, ROOT), name="detector_validation_series.json")
        pstart = [(rm.ts(day, p["time"]), p["phase"], p["expected"]) for p in phases]
        phase_of = lambda t: max((p for p in pstart if p[0] <= t), key=lambda p: p[0])
        res = {"v12": detector_v12(pts), "v13": rm.detector(pts)}
        has_clean = any(rm.clean_reading(t0, t0 + 30) is not None for t0, _, _ in pstart[1:])
        print(f"### {day} ({version} validation{'' if has_clean else '; no post-change data left in Prometheus'})\n")
        print("| Phase | Expected | Pods | v12 (90 s skipped) | v13 (followed on post-change data) |\n|---|---|---|---|---|")
        prev = None
        for (t0, name, exp), p in zip(pstart, phases):
            cells = []
            for m in ("v12", "v13"):
                w = [(wt, st) for wt, st in res[m] if phase_of(wt)[1] == name]
                cells.append(", ".join(f"{wt - t0:.0f}{'*' if st - t0 < rm.PHASE_LAG_S else ''}" for wt, st in w)
                             or "none")
                tot = totals.setdefault(m, [0, 0, 0, 0])
                tot[0] += sum(1 for wt, st in w if exp == "normal" and st - t0 >= rm.PHASE_LAG_S)
                tot[1] += bool(w) and exp != "normal"
                tot[2] += exp != "normal"
                tot[3] += len(w) if exp == "normal" else 0
            changed = prev is not None and p["replicas"] != prev
            print(f"| {name} | {exp} | {prev + '->' if changed else ''}{p['replicas']} | " + " | ".join(cells) + " |")
            prev = p["replicas"]
        print()
    for m, (false, caught, anomalous, normal_all) in totals.items():
        print(f"- {m}: false wake-ups in normal phases {false} (all wake-ups in normal phases, the * ones included: "
              f"{normal_all}); anomaly phases woken {caught}/{anomalous}")
    print()
    return totals


def section4():
    print("## 4. The campaigns' valid runs through both detectors\n")
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
            w12, w13 = detector_v12(pts), rm.detector(pts)
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
          "runs the HPA changed the pod count and nothing verified the change: v13 follows it on post-change data (none "
          "left in Prometheus for 23/10: there it judges the series once its readings are a minute long); v12 skipped "
          "90 s and then needed 3 anomalous readings in a row.\n")
    return agent_same, agent_n


def main():
    print("# Agent v13's detector and verification against v12's (A32, A32.1)\n")
    noise = B["window_noise"]
    print(f"*`replay_v13.py`, {datetime.now():%Y-%m-%d %H:%M}. Model {B['model_type']} trained {B.get('trained_at')}: "
          f"gamma {B['gamma']}. Detector: 3 anomalous readings in a row, {ad.AGENT_COOLDOWN_SECONDS} s cooldown. "
          f"Post-change readings from +{nfr_metrics.MIN_CLEAN_SECONDS} s; still anomalous after {hm.GIVE_UP_SECONDS} s "
          f"-> UNSTABLE. Noise of a comparison (window_noise.json, {noise['sequences']} sequences of {len(noise['runs'])} "
          "HPA runs): 10 s apart " + ", ".join(f"+{k} s {v:.2f}" for k, v in noise["step"].items())
          + "; 30 s apart " + ", ".join(f"+{k} s {v:.2f}" for k, v in noise["span"].items()) + ".*\n")
    all_actions = actions()
    n1, kinds, shift_same = section1(all_actions)
    n2, rows2 = section2(all_actions)
    totals = section3()
    same, n4 = section4()
    rm.save_clean_cache()
    v12, v13 = totals["v12"], totals["v13"]
    print("## Checks\n")
    print(f"- verification: {n1} actions with post-change readings; "
          + "; ".join(f"recorded {k[0]} -> v13 {k[1]}: {v}" for k, v in kinds.items() if k != "no data")
          + f"; same verdict with the rollout {SHIFT_S} s later: {shift_same}/{n1}")
    print(f"- detector after a STABLE action: {len(rows2)} of {n2} with a wake-up in either detector")
    print(f"- validations: v13 false wake-ups in normal phases {v13[0]} (v12 {v12[0]}), all wake-ups in normal phases "
          f"{v13[3]} (v12 {v12[3]}), anomaly phases woken {v13[1]}/{v13[2]} (v12 {v12[1]}/{v12[2]})")
    print(f"- campaigns: agent runs with the same wake-ups {same}/{n4}")


if __name__ == "__main__":
    main()
