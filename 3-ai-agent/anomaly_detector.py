import argparse
import csv
import json
import os
import signal
import time
from collections import deque
from datetime import datetime

import health_model
import nfr_metrics

INTERVAL_SECONDS = 10
# Paths relative to this file (until 2026-10-11 relative to the working directory, so the detector
# only worked when started from the repo root).
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_FILENAME = os.path.join(REPO_ROOT, "5-ml-training", "health_model.pkl")
DRY_RUN_CSV = os.path.join(REPO_ROOT, "5-ml-training", "dry_run_readings.csv")
# Below this there isn't enough traffic for a meaningful evaluation (= the training filter's MIN_RPS).
# Phase 2 (2026-10-22): throughput is counted at the ingress for every status, so an app that answers only
# errors (no ready pod) is not "low traffic"; requests that never finish are still counted only when they end.
MIN_THROUGHPUT_RPS = 1.0
# Consecutive anomalous readings required before waking the agent (3 x 10s = 30s).
ANOMALY_STREAK_REQUIRED = 3
# After a change (A32, A32.1, 2026-11-02; until v12 the detector skipped 90 s from the moment it saw a pod-count change,
# i.e. after the agent's verification had already watched it):
#   - the readings hold only data from after the change took effect (nfr_metrics.clean_window: the window starts there
#     and grows to the usual minute; the first such reading exists 20 s after it), so nothing from before it is judged;
#   - a change the agent's verification watched (it ended STABLE, or asked for a re-wake; a scale or a restart) is not
#     followed again: the readings after it are judged as usual;
#   - any other pod-count change (a person, the validation script, the rollback of a failed scale-down) is followed, from
#     the moment the readings show its pods ready, with the verification's own rule (health_model.judge_trajectory):
#     healthy -> normal monitoring at once; anomalous but moving towards healthy -> wait, not counted; worse / not
#     improving / still anomalous after 4 min -> a confirmed anomaly.
# Minimum time between two agent runs: it limits the LLM calls, e.g. while an anomaly the agent answered with "No action"
# lasts. Monitoring continues meanwhile.
AGENT_COOLDOWN_SECONDS = 60
# Phase 2: when the verification of an action sees the score get worse or stay stuck, the agent is woken
# again at once (no streak, no cooldown: the verification already watched the change),
# at most this many times in a row; then the normal streak and cooldown apply again.
MAX_REWAKES = 2
# The load trend handed to the agent (2026-10-23, the user's "slope" idea): least-squares slope of the throughput
# over the last TREND_WINDOW_SECONDS of readings, in rps per minute. The agent's facts use it to size a scale-up
# for the load the trend reaches by the time new pods serve.
TREND_WINDOW_SECONDS = 60
# The columns of the dry-run CSV (the NFR reading; CPU per pod for reference only, not a model input).
LOGGED_METRICS = ["throughput", "rps_per_pod", "latency_p95", "error_rate", "replicas", "ready_replicas",
                  "avg_cpu_per_pod"]


def read_metrics(window=nfr_metrics.WINDOW):
    """One reading of the NFR metrics (nfr_metrics.py) over `window`, or None if a required one is missing."""
    try:
        return nfr_metrics.fetch_reading(window=window)
    except Exception as e:
        print(f"Metrics unavailable: {e}")
        return None


def print_summary(stats, started_at, dry_run):
    minutes = (time.monotonic() - started_at) / 60
    evaluated = stats["evaluated"]
    anomaly_pct = stats["anomalous"] / evaluated * 100 if evaluated else 0.0
    per_hour = f" ({stats['triggers'] / minutes * 60:.1f}/hour)" if minutes > 0 else ""
    label = "Would have woken the agent" if dry_run else "Woke the agent"

    print(f"\n--- Monitor summary ({minutes:.1f} min{', DRY RUN' if dry_run else ''}) ---")
    print(f"  Readings evaluated:          {evaluated}")
    print(f"  Anomalous readings:          {stats['anomalous']} ({anomaly_pct:.1f}%)")
    print(f"  {label + ':':<29}{stats['triggers']}{per_hour}")
    if stats["rewakes"]:
        print(f"  Of which re-wakes:           {stats['rewakes']} (verification saw no improvement)")
    print(f"  Pod-count changes followed:  {stats['followed']} ({stats['follow_waits']} readings waited, "
          f"{stats['follow_unstable']} ended UNSTABLE)")
    print(f"  Waits for post-change data:  {stats['no_clean_data']} (readings before 20 s of data after a change)")
    print(
        f"  Skipped readings:            low_traffic={stats['skipped_low_traffic']} "
        f"missing_metrics={stats['skipped_missing']}"
    )
    if stats["agent_errors"]:
        print(f"  Agent runs that raised:      {stats['agent_errors']} (see the log above)")
    if dry_run:
        print(f"  Per-reading log:             {DRY_RUN_CSV}")


def load_model():
    """The bundle saved by train_health_baseline.py (one One-Class SVM, health_model.py; v12's since 2026-11-01)."""
    try:
        return health_model.load(MODEL_FILENAME)
    except FileNotFoundError:
        print("Error: The model file was not found. Run 5-ml-training/train_health_baseline.py first.")
    except ValueError as e:
        print(f"Error: {e}")
    return None


def load_trend(history):
    """rps per minute over the (monotonic time, throughput) pairs, or None with fewer than 4 readings."""
    if len(history) < 4:
        return None
    t0 = history[0][0]
    xs = [(t - t0) / 60 for t, _ in history]
    ys = [y for _, y in history]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    var = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / var if var else None


def evaluate(bundle, reading):
    """(prediction, score) of one reading: -1 = anomaly, 1 = normal; score = health_model.score (the SVM's own
    decision, read as a distance: same sign as its decision_function)."""
    score = health_model.score(bundle, reading)
    return (-1 if score < 0 else 1), score


def _outcome(result):
    """trigger_ai_agent returns {"resolved", "rewake", "verdict", "changed_at"}; a bare bool is read as "resolved"."""
    if isinstance(result, dict):
        return (bool(result.get("resolved")), bool(result.get("rewake")), result.get("verdict", ""),
                result.get("changed_at"))
    return bool(result), False, "", None


def run_monitor(dry_run=False):
    print(f"Loading anomaly detection model from: {MODEL_FILENAME}")
    bundle = load_model()
    if bundle is None:
        return
    print(f"Model: {bundle['model_type']} (gamma {bundle['gamma']}), features {bundle['features']}, "
          f"trained {bundle.get('trained_at', '?')} on {bundle.get('n_train', '?')} readings")

    if dry_run:
        # No agent import: dry runs need no LLM key and never touch the cluster.
        print("🧪 DRY RUN: anomalies are counted and logged, the agent is never called.")
        # Never overwrite an earlier run's evidence: move it aside with its timestamp.
        if os.path.exists(DRY_RUN_CSV):
            stamp = datetime.fromtimestamp(os.path.getmtime(DRY_RUN_CSV)).strftime("%Y%m%d_%H%M%S")
            base, ext = os.path.splitext(DRY_RUN_CSV)
            kept = f"{base}_{stamp}{ext}"
            os.replace(DRY_RUN_CSV, kept)
            print(f"Previous dry-run log kept as {kept}")
        csv_file = open(DRY_RUN_CSV, "w", newline="")
        csv_writer = csv.DictWriter(
            csv_file,
            fieldnames=["timestamp", *LOGGED_METRICS, "window", "prediction", "score", "streak", "follow",
                        "would_trigger"],
        )
        csv_writer.writeheader()
    else:
        from agent import trigger_ai_agent

    print("✅ Model loaded. Starting continuous monitoring...")

    stats = {
        "evaluated": 0, "anomalous": 0, "triggers": 0, "rewakes": 0,
        "followed": 0, "follow_waits": 0, "follow_unstable": 0, "no_clean_data": 0,
        "skipped_low_traffic": 0, "skipped_missing": 0, "agent_errors": 0,
    }
    started_at = time.monotonic()
    anomaly_streak = 0
    last_replicas = None
    window_from = None   # monotonic time a change took effect: readings hold data since then until they are 1 m long
    following = None     # a pod-count change no verification watched: {"seen", "start", "points"}
    cooldown_until = 0.0
    rewake_pending = False
    rewakes_in_a_row = 0
    history = deque()   # (monotonic time, throughput) of the last TREND_WINDOW_SECONDS

    try:
        while True:
            now = time.monotonic()
            window = nfr_metrics.WINDOW
            if window_from is not None:
                window = nfr_metrics.clean_window(now - window_from)     # None: no post-change reading yet
                if window == nfr_metrics.WINDOW:
                    window_from = None
            reading = read_metrics(window or nfr_metrics.WINDOW)
            if reading is None:
                print("Metrics unavailable. Skipping ML prediction and remediation.")
                stats["skipped_missing"] += 1
                anomaly_streak = 0
                time.sleep(INTERVAL_SECONDS)
                continue

            replicas = reading["replicas"]
            throughput = reading["throughput"]
            timestamp = datetime.now().strftime("%H:%M:%S")

            # A pod-count change no verification watched (A32): followed with the verification's rule on post-change
            # data, from the reading that shows its pods ready (or after ROLLOUT_WAIT_SECONDS: a pod may never become
            # ready). After a run of the agent whose verification watched its change, last_replicas is None here.
            if last_replicas is not None and replicas != last_replicas:
                following = {"seen": now, "start": None, "points": []}
                window_from = None
                stats["followed"] += 1
            last_replicas = replicas
            if following is not None and following["start"] is None:
                if ((reading.get("ready_replicas") or 0) >= replicas
                        or now - following["seen"] >= health_model.ROLLOUT_WAIT_SECONDS):
                    following["start"] = window_from = now
                window = None      # this reading still holds data from before the change took effect
            if window is None:
                print(f"[{timestamp}] {replicas:.0f} pod(s): waiting for {nfr_metrics.MIN_CLEAN_SECONDS}s of data "
                      "from after the change.")
                stats["no_clean_data"] += 1
                anomaly_streak = 0
                time.sleep(INTERVAL_SECONDS)
                continue
            history.append((now, throughput))
            while history and now - history[0][0] > TREND_WINDOW_SECONDS:
                history.popleft()

            # Data quality gate: not enough traffic for a meaningful evaluation.
            if throughput < MIN_THROUGHPUT_RPS:
                print(f"[{timestamp}] Low traffic ({throughput:.2f} rps) — skipping prediction.")
                stats["skipped_low_traffic"] += 1
                anomaly_streak = 0
                rewake_pending = False
                time.sleep(INTERVAL_SECONDS)
                continue

            # One model for every replica count: the count is an input, and each count keeps its own
            # healthy band (below it = over-provisioned, above it = overloaded; latency above the safe level or
            # errors = broken). The score (since v10, A28): 0..1 healthy, below 0 the distance from healthy.
            prediction, score = evaluate(bundle, reading)
            stats["evaluated"] += 1
            print(
                f"rps: {throughput:.1f} ({reading['rps_per_pod']:.1f}/pod), p95: {reading['latency_p95']:.3f}s, "
                f"errors: {100 * reading['error_rate']:.1f}%, replicas: {replicas:.0f} "
                f"(ready {reading.get('ready_replicas') or 0:.0f}), prediction: {prediction} (score {score:+.3f})"
            )

            follow = None
            if following is not None:
                following["points"].append((now - following["start"], score))
                follow = health_model.judge_trajectory(bundle, following["points"])
                if follow != "WAIT":
                    following = None

            if prediction == -1:
                stats["anomalous"] += 1
                anomaly_streak += 1
            else:
                anomaly_streak = 0
                rewake_pending = False
                rewakes_in_a_row = 0
            if follow == "WAIT":
                anomaly_streak = 0     # anomalous but moving towards healthy since the change, or too early to tell
                stats["follow_waits"] += 1
            elif follow is not None and follow.startswith("UNSTABLE"):
                anomaly_streak = max(anomaly_streak, ANOMALY_STREAK_REQUIRED)   # the rule has confirmed it
                stats["follow_unstable"] += 1
            cooldown_left = cooldown_until - time.monotonic()
            rewake_now = rewake_pending and prediction == -1 and follow != "WAIT"
            should_trigger = rewake_now or (anomaly_streak >= ANOMALY_STREAK_REQUIRED and cooldown_left <= 0)

            if dry_run:
                csv_writer.writerow({
                    "timestamp": timestamp,
                    **{name: reading.get(name) for name in LOGGED_METRICS},
                    "window": window,
                    "prediction": prediction,
                    "score": round(score, 4),
                    "streak": anomaly_streak,
                    "follow": follow or "",
                    "would_trigger": should_trigger,
                })
                csv_file.flush()

            if prediction != -1:
                settled = f" The change to {replicas:.0f} pod(s) is healthy." if follow == "STABLE" else ""
                print(f"[{timestamp}]  Normal operation.{settled}")
                time.sleep(INTERVAL_SECONDS)
                continue

            if follow == "WAIT":
                print(f"[{timestamp}] Pods changed to {replicas:.0f}, {following['points'][-1][0]:.0f}s of data since "
                      "— anomalous, following the change (WAIT: not worse; improving, or under 30 s of readings to "
                      "tell).")
                time.sleep(INTERVAL_SECONDS)
                continue
            if follow is not None:
                print(f"[{timestamp}] Pods changed to {replicas:.0f}: {follow}.")

            if not should_trigger:
                if anomaly_streak >= ANOMALY_STREAK_REQUIRED:
                    print(f"[{timestamp}] Anomaly confirmed, but agent cooldown has {cooldown_left:.0f}s left.")
                else:
                    print(
                        f"[{timestamp}] Anomalous reading {anomaly_streak}/"
                        f"{ANOMALY_STREAK_REQUIRED} — waiting for confirmation."
                    )
                time.sleep(INTERVAL_SECONDS)
                continue

            anomaly_streak = 0
            rewake_pending = False
            stats["triggers"] += 1
            stats["rewakes"] += rewake_now
            explanation = health_model.explain(bundle, reading)

            print(f"\n[{timestamp}] {'RE-WAKE: the last action did not help' if rewake_now else 'ANOMALY DETECTED!'}")
            print(f"Score {score:+.3f}: " + "; ".join(explanation))

            if dry_run:
                print("🧪 [DRY RUN] The agent would be woken up now — not calling it.")
            else:
                trend = load_trend(history)
                metrics_json = json.dumps({**reading, "score": round(score, 4), "explanation": explanation,
                                           "load_trend_rps_per_min": round(trend, 1) if trend is not None else None})
                print("Αναμονή ολοκλήρωσης ενεργειών από τον Agent...")
                try:
                    resolved, rewake, verdict, changed_at = _outcome(trigger_ai_agent(metrics_json))
                except Exception as e:
                    # trigger_ai_agent already survives LLM errors; this catches anything else around it
                    # (e.g. a failed write of incident_log.csv). Without it one such error would end
                    # monitoring in the middle of an experiment. (Added 2026-10-11.)
                    stats["agent_errors"] += 1
                    print(f"⚠️ Agent run failed outside the agent: {type(e).__name__}: {e}. Monitoring continues.")
                    resolved, rewake, verdict, changed_at = False, False, "", None

                # The verification watched the change of this run (STABLE, or UNSTABLE with a re-wake): the next
                # reading is judged as usual, the change is not followed again, and the readings hold only data from
                # after it took effect (A32.1). Not after the rollback of a failed scale-down (code restored the pod
                # count, nothing watched it: it is followed), an unverifiable action or no action.
                if verdict and (resolved or rewake):
                    last_replicas = None
                    following = None
                    if changed_at is not None:
                        window_from = changed_at
                now = datetime.now().strftime('%H:%M:%S')
                if resolved:
                    rewakes_in_a_row = 0
                    print(f"\n[{now}]  Το πρόβλημα επιλύθηκε από τον Agent. Επανεκκίνηση παρακολούθησης.")
                elif rewake and rewakes_in_a_row < MAX_REWAKES:
                    rewakes_in_a_row += 1
                    rewake_pending = True
                    print(f"\n[{now}] {verdict}: ο Agent ξαναξυπνά αν η επόμενη μέτρηση είναι ακόμα ανωμαλία "
                          f"({rewakes_in_a_row}/{MAX_REWAKES}).")
                else:
                    rewakes_in_a_row = 0
                    print(f"\n[{now}] Ο Agent δεν επιβεβαίωσε επίλυση. Επανεκκίνηση παρακολούθησης.")

            if not rewake_pending:
                cooldown_until = time.monotonic() + AGENT_COOLDOWN_SECONDS
                print(f"Agent cooldown {AGENT_COOLDOWN_SECONDS}s (monitoring continues).")
            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped by user.")
    finally:
        print_summary(stats, started_at, dry_run)
        if dry_run:
            csv_file.close()


def _stop_on_sigterm(*_):
    # The experiment scripts stop controllers with SIGTERM (background jobs of a
    # non-interactive shell ignore SIGINT). Treat it like Ctrl+C so the summary prints.
    raise KeyboardInterrupt


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _stop_on_sigterm)
    parser = argparse.ArgumentParser(description="ML anomaly monitor that wakes the AIOps agent.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate and log anomalies without calling the agent (no LLM calls, no cluster changes).",
    )
    run_monitor(dry_run=parser.parse_args().dry_run)
