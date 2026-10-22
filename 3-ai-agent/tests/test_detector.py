"""
The detector loop (anomaly_detector.run_monitor): its gates, cooldown, dry-run log and error handling.

The model and Prometheus are replaced: a fake verdict (anomaly when p95 > 0.35 s) stands in for the One-Class
SVM, readings come from a list, and a fake clock replaces time, so a 2-minute scenario runs in milliseconds.
(The model itself is checked by train_health_baseline.py's probes, not here.) Added 2026-10-11: until then the
detector had no unit tests.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import csv
import os
import sys
import types
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import anomaly_detector as ad  # noqa: E402

BUNDLE = {"model_type": "fake", "features": [], "models": {1: None, 2: None, 3: None}}


def reading(p95=0.1, rps=5.0, reps=1, missing=None):
    r = {"avg_cpu_per_pod": 0.3, "throughput": rps, "latency_p95": p95, "active_replicas": float(reps),
         "cpu_throttling": 0.01}
    if missing:
        r[missing] = None
    return r


N = reading()                    # normal
A = reading(p95=1.0)             # anomalous
MISSING = reading(missing="latency_p95")
LOW = reading(p95=1.0, rps=0.5)  # anomalous, but below the 0.8 rps gate


def fake_evaluate(_bundle, m):
    return (-1, -0.5) if m["latency_p95"] > 0.35 else (1, 0.1)


class Clock:
    def __init__(self):
        self.t = 1000.0

    def monotonic(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


def run(readings, dry_run=False, trigger=None, csv_path=None):
    """Run the real loop over these readings (one per 10 s); return the fake trigger_ai_agent."""
    it = iter(readings)
    current = {}
    first = next(iter(ad.QUERIES))

    def fetch(name, _query):
        if name == first:
            try:
                current.clear()
                current.update(next(it))
            except StopIteration:
                raise KeyboardInterrupt  # what Ctrl+C / SIGTERM does: ends the loop, prints the summary
        return current[name]

    clock = Clock()
    agent_module = types.ModuleType("agent")
    agent_module.trigger_ai_agent = trigger or mock.Mock(return_value=True)
    with mock.patch.object(ad, "fetch_metric", side_effect=fetch), \
         mock.patch.object(ad, "load_models", return_value=BUNDLE), \
         mock.patch.object(ad, "evaluate", side_effect=fake_evaluate), \
         mock.patch.object(ad, "time", types.SimpleNamespace(monotonic=clock.monotonic, sleep=clock.sleep)), \
         mock.patch.object(ad, "DRY_RUN_CSV", str(csv_path) if csv_path else ad.DRY_RUN_CSV), \
         mock.patch.dict(sys.modules, {"agent": None if dry_run else agent_module}):
        ad.run_monitor(dry_run=dry_run)
    return agent_module.trigger_ai_agent


def test_three_anomalies_in_a_row_wake_the_agent():
    assert run([A, A, N, A, A]).call_count == 0            # never 3 in a row
    trigger = run([N, A, A, A])
    assert trigger.call_count == 1
    assert trigger.call_args.args[0].startswith("{")      # the agent gets the metrics as JSON


@pytest.mark.parametrize("gap", [MISSING, LOW, N])
def test_a_skip_or_a_normal_reading_resets_the_streak(gap):
    assert run([A, A, gap, A, A]).call_count == 0


def test_cooldown_blocks_a_new_wake_up_for_60_s_but_monitoring_continues():
    # Woken at the 3rd reading (t = 20 s); the cooldown ends 60 s later, at the 9th reading.
    assert run([A] * 8).call_count == 1
    assert run([A] * 9).call_count == 2


def test_replica_change_is_settled_for_90_s():
    # The first reading at 2 replicas starts the 90 s settle: it and the next 8 are skipped,
    # then 3 anomalous readings are needed.
    assert run([N] + [reading(p95=1.0, reps=2)] * 11).call_count == 0
    assert run([N] + [reading(p95=1.0, reps=2)] * 12).call_count == 1


def test_an_error_around_the_agent_does_not_stop_monitoring(capsys):
    trigger = mock.Mock(side_effect=[OSError("incident_log.csv: disk full"), True])
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
    assert list(rows[0])[1:6] == ad.LOGGED_METRICS
    kept = [p for p in os.listdir(tmp_path) if p.startswith("dry_run_readings_")]
    assert len(kept) == 1 and open(tmp_path / kept[0]).read() == "earlier run\n"   # never overwritten


def test_a_replica_count_without_a_model_is_an_anomaly():
    assert ad.evaluate({"features": ["throughput"], "models": {1: None}}, reading(reps=4)) == (-1, None)


def test_paths_do_not_depend_on_the_working_directory():
    for path in (ad.MODEL_FILENAME, ad.DRY_RUN_CSV):
        assert os.path.isabs(path) and os.path.dirname(path) == os.path.join(ad.REPO_ROOT, "5-ml-training")
