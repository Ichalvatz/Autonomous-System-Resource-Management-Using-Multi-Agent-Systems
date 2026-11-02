"""
The detector loop (anomaly_detector.run_monitor): its gates, the follow of a pod-count change, cooldown, re-wake,
dry-run log and error handling.

The model and Prometheus are replaced: a fake verdict (anomaly when p95 > 0.35 s or errors > 1%) stands in for
the One-Class SVM, readings come from a list, and a fake clock replaces time, so a 2-minute scenario runs in
milliseconds. (The model itself is checked by train_health_baseline.py's probes, not here.) Added 2026-10-11;
rewritten 2026-10-22 for phase 2 (NFR readings, one model, re-wake after a verification that saw no improvement);
2026-11-02 (A32): a pod-count change is followed with the verification's rule instead of skipped for 90 s.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import csv
import json
import os
import sys
import types
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anomaly_detector as ad  # noqa: E402

BUNDLE = {"model_type": "fake", "features": [], "gamma": 0.2, "bands": {1: [1, 80]},
          "window_noise": {"step": {"30": 0.05, "120": 0.05}, "span": {"50": 0.05, "120": 0.05}},
          "params": {"safe_p95": 0.25, "nfr_p95": 0.35, "safe_errors": 0.001, "nfr_errors": 0.01}}


def reading(p95=0.1, rps=40.0, reps=1, err=0.0):
    return {"throughput": rps, "rps_per_pod": rps / reps, "latency_p95": p95, "error_rate": err,
            "replicas": float(reps), "ready_replicas": float(reps), "avg_cpu_per_pod": 0.3, "timestamp": "x"}


N = reading()                    # normal
A = reading(p95=1.0)             # anomalous
OUT = reading(p95=0.01, err=1.0)  # no ready pod: every request is a fast 503 from the ingress
MISSING = None
LOW = reading(p95=1.0, rps=0.5)  # anomalous, but below the 1 rps gate


def fake_evaluate(_bundle, m):
    """Anomalous above the NFRs, with a distance that grows with p95 (p95 1.0 s -> -0.5), so a trajectory has a
    direction; healthy 0.1."""
    if m["latency_p95"] > 0.35 or m["error_rate"] > 0.01:
        return -1, -0.5 * max(m["latency_p95"], 1.0 if m["error_rate"] > 0.01 else 0.0)
    return 1, 0.1


class Clock:
    def __init__(self):
        self.t = 1000.0

    def monotonic(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


def run(readings, dry_run=False, trigger=None, csv_path=None, windows=None):
    """Run the real loop over these readings (one per 10 s, the first at t = 1000); return the fake trigger_ai_agent.
    windows: a list that receives the window of every reading the loop asked for."""
    it = iter(readings)

    def fetch(window="1m"):
        try:
            r = next(it)
        except StopIteration:
            raise KeyboardInterrupt  # what Ctrl+C / SIGTERM does: ends the loop, prints the summary
        if windows is not None:
            windows.append(window)
        return r

    clock = Clock()
    agent_module = types.ModuleType("agent")
    agent_module.trigger_ai_agent = trigger or mock.Mock(return_value={"resolved": True, "rewake": False})
    with mock.patch.object(ad, "read_metrics", side_effect=fetch), \
         mock.patch.object(ad, "load_model", return_value=BUNDLE), \
         mock.patch.object(ad, "evaluate", side_effect=fake_evaluate), \
         mock.patch.object(ad.health_model, "explain", return_value=["p95 latency 1.00 s is above ..."]), \
         mock.patch.object(ad, "time", types.SimpleNamespace(monotonic=clock.monotonic, sleep=clock.sleep)), \
         mock.patch.object(ad, "DRY_RUN_CSV", str(csv_path) if csv_path else ad.DRY_RUN_CSV), \
         mock.patch.dict(sys.modules, {"agent": None if dry_run else agent_module}):
        ad.run_monitor(dry_run=dry_run)
    return agent_module.trigger_ai_agent


def test_three_anomalies_in_a_row_wake_the_agent():
    assert run([A, A, N, A, A]).call_count == 0            # never 3 in a row
    trigger = run([N, A, A, A])
    assert trigger.call_count == 1
    sent = json.loads(trigger.call_args.args[0])          # the agent gets the reading as JSON,
    assert sent["latency_p95"] == 1.0 and sent["score"] == -0.5 and sent["explanation"]   # with score and why


@pytest.mark.parametrize("gap", [MISSING, LOW, N])
def test_a_skip_or_a_normal_reading_resets_the_streak(gap):
    assert run([A, A, gap, A, A]).call_count == 0


def test_an_outage_is_an_anomaly_not_low_traffic():
    # No ready pod: the ingress answers every request with a fast 503. The throughput stays (all statuses count).
    assert run([N, OUT, OUT, OUT]).call_count == 1


def test_cooldown_blocks_a_new_wake_up_for_60_s_but_monitoring_continues():
    # Woken at the 3rd reading (t = 20 s); the cooldown ends 60 s later, at the 9th reading.
    assert run([A] * 8).call_count == 1
    assert run([A] * 9).call_count == 2


# After a change (A32, A32.1, 2026-11-02; until v12 every pod-count change was skipped for 90 s) the readings hold only
# data since it took effect, the first one 20 s after it. A pod-count change the agent's verification did not watch
# (here: a person or a script, no agent run) is followed with the verification's rule from the reading that shows its
# pods ready: that reading and the next (10 s of data) wait, the third (20 s) is the first one judged.
A2 = reading(p95=1.0, reps=2)                       # anomalous at 2 pods, score -0.5
N2 = reading(reps=2)


def test_after_a_change_the_readings_hold_only_post_change_data():
    windows = []
    run([N, N2, N2, N2, N2, N2, N2, N2, N2], windows=windows)
    # the change is seen (and its pods ready) at t = 1010: 20 s later the first reading of it, its window growing
    assert windows == ["1m", "1m", "1m", "20s", "30s", "40s", "50s", "1m", "1m"]


def test_a_change_to_a_healthy_state_is_judged_at_once():
    # The first reading of post-change data is healthy: the change is settled, and 3 anomalies after it wake the agent.
    assert run([N, N2, N2, N2, A2, A2]).call_count == 0
    assert run([N, N2, N2, N2, A2, A2, A2]).call_count == 1


def test_a_change_moving_towards_healthy_waits_and_does_not_wake():
    # The distance falls every 10 s (by more than the noise), then healthy.
    improving = [reading(p95=p, reps=2) for p in (3.0, 2.6, 2.2, 1.8, 1.4, 1.0, 0.8, 0.6, 0.4)]
    assert run([N] + improving + [N2]).call_count == 0


def test_a_change_that_gets_worse_wakes_at_once():
    # From the first reading of post-change data (-0.5) to the next (-1.0): worse.
    assert run([N, A2, A2, A2]).call_count == 0
    assert run([N, A2, A2, A2, reading(p95=2.0, reps=2)]).call_count == 1


def test_a_change_that_does_not_improve_wakes_after_three_readings_without_a_rise():
    # A flat -0.5 from the first reading of post-change data (+20 s): not improving at +50 s, the 6th reading at 2 pods.
    assert run([N] + [A2] * 5).call_count == 0
    assert run([N] + [A2] * 6).call_count == 1


@pytest.mark.parametrize("outcome, calls", [
    ({"resolved": True, "rewake": False, "verdict": "STABLE"}, 2),            # watched: judged as usual
    ({"resolved": False, "rewake": False, "verdict": "UNSTABLE: worse"}, 1),  # a rollback restored the count: followed
    ({"resolved": True, "rewake": False}, 1),                 # no action, so a change by someone else: followed
])
def test_a_change_the_verification_watched_is_not_followed_again(outcome, calls):
    # The agent scaled 1 -> 2 at the 3rd reading, then the score moves back towards healthy, slowly. Watched: the
    # readings at 2 pods are judged as usual, so the cooldown (60 s) is all that holds a second wake-up. Not watched:
    # followed, and a distance that falls every 10 s waits.
    trigger = mock.Mock(return_value=outcome)
    improving = [reading(p95=p, reps=2) for p in (3.0, 2.6, 2.2, 1.8, 1.4, 1.0, 0.8, 0.6)]
    assert run([A, A, A] + improving, trigger=trigger).call_count == calls


def test_after_a_verified_action_the_readings_hold_only_data_since_its_rollout():
    # The agent acted at the 3rd reading (t = 1020) and its rollout converged then (changed_at, the same monotonic
    # clock): the next reading has 10 s of data and waits, then the window grows from 20 s to the usual minute.
    trigger = mock.Mock(return_value={"resolved": True, "rewake": False, "verdict": "STABLE", "changed_at": 1020.0})
    windows = []
    run([A, A, A] + [N2] * 7, trigger=trigger, windows=windows)
    assert windows[3:] == ["1m", "20s", "30s", "40s", "50s", "1m", "1m"]
    assert trigger.call_count == 1


def test_a_failed_verification_rewakes_at_once_without_streak_or_cooldown():
    # The agent scaled 1 -> 2 and the verification saw no improvement: the next anomalous reading wakes it again,
    # even though the replica count just changed and the cooldown has not passed.
    outcome = {"resolved": False, "rewake": True, "verdict": "UNSTABLE: not improving"}
    trigger = mock.Mock(side_effect=[outcome, {"resolved": True, "rewake": False}])
    assert run([A, A, A, reading(p95=1.0, reps=2)], trigger=trigger).call_count == 2


def test_rewakes_stop_after_max_in_a_row():
    outcome = {"resolved": False, "rewake": True, "verdict": "UNSTABLE: worse"}
    trigger = mock.Mock(return_value=outcome)
    # 1 normal wake-up + MAX_REWAKES re-wakes; then the 60 s cooldown applies again.
    assert run([A] * (3 + ad.MAX_REWAKES + 2), trigger=trigger).call_count == 1 + ad.MAX_REWAKES


def test_a_normal_reading_cancels_a_pending_rewake():
    outcome = {"resolved": False, "rewake": True, "verdict": "UNSTABLE: not improving"}
    trigger = mock.Mock(return_value=outcome)
    assert run([A, A, A, N, A], trigger=trigger).call_count == 1


def test_a_bare_bool_from_the_agent_still_works():
    assert run([A, A, A], trigger=mock.Mock(return_value=True)).call_count == 1


def test_an_error_around_the_agent_does_not_stop_monitoring(capsys):
    trigger = mock.Mock(side_effect=[OSError("incident_log.csv: disk full"), {"resolved": True}])
    run([A] * 9, trigger=trigger)
    assert trigger.call_count == 2                        # the loop went on after the first run raised
    out = capsys.readouterr().out
    assert "Agent run failed outside the agent: OSError" in out and "Agent runs that raised:      1" in out


def test_dry_run_logs_every_evaluated_reading_and_never_imports_the_agent(tmp_path):
    path = tmp_path / "dry_run_readings.csv"
    path.write_text("earlier run\n")
    run([N, A, A, A, MISSING], dry_run=True, csv_path=path)   # sys.modules["agent"] = None: an import would fail
    rows = list(csv.DictReader(open(path)))
    assert [r["prediction"] for r in rows] == ["1", "-1", "-1", "-1"]   # the missing reading is not logged
    assert [r["would_trigger"] for r in rows] == ["False", "False", "False", "True"]
    assert list(rows[0])[1:1 + len(ad.LOGGED_METRICS)] == ad.LOGGED_METRICS
    assert [r["follow"] for r in rows] == ["", "", "", ""]                # no pod-count change to follow
    kept = [p for p in os.listdir(tmp_path) if p.startswith("dry_run_readings_")]
    assert len(kept) == 1 and open(tmp_path / kept[0]).read() == "earlier run\n"   # never overwritten


def test_paths_do_not_depend_on_the_working_directory():
    for path in (ad.MODEL_FILENAME, ad.DRY_RUN_CSV):
        assert os.path.isabs(path) and os.path.dirname(path) == os.path.join(ad.REPO_ROOT, "5-ml-training")


def test_load_trend_is_the_slope_over_the_last_minute():
    assert ad.load_trend([(0, 100), (10, 100)]) is None                       # too few readings
    assert ad.load_trend([(t, 100 + t / 3) for t in range(0, 60, 10)]) == pytest.approx(20.0)   # +20 rps/min
    assert ad.load_trend([(t, 50.0) for t in range(0, 60, 10)]) == pytest.approx(0.0)


def test_the_agent_gets_the_load_trend():
    ramp = [reading(p95=1.0, rps=100 + 5 * i) for i in range(6)]          # +5 rps every 10 s = +30 rps/min
    trigger = run([N, N, N] + ramp)
    sent = json.loads(trigger.call_args.args[0])
    assert sent["load_trend_rps_per_min"] > 0
