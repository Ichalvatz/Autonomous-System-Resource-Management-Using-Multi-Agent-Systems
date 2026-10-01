"""
Unit tests for the deterministic parts of the AIOps runtime: safety guards,
verification verdicts, incident-memory retrieval, rollback and the rule-based
baseline. Kubernetes, Prometheus and ChromaDB are mocked: nothing touches the cluster.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import json
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GEMINI_API_KEY", "dummy-for-tests")

import agent_tools  # noqa: E402
import rule_scaler  # noqa: E402


def metrics(reps, rps, cpu=0.5, thr=0.02, p95=0.12):
    return {"active_replicas": float(reps), "throughput": rps, "avg_cpu_per_pod": cpu,
            "cpu_throttling": thr, "latency_p95": p95}


# ---------------------------------------------------------------- scale guards

@pytest.fixture
def fake_k8s():
    """Deployment currently at 2 replicas; records patch calls."""
    agent_tools._last_scale_action_at = 0.0
    agent_tools.reset_run_outcome()
    api = mock.MagicMock()
    api.read_namespaced_deployment_scale.return_value.spec.replicas = 2
    with mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "AppsV1Api", return_value=api):
        yield api


@pytest.mark.parametrize("replicas", [0, 4, 10, -1])
def test_scale_rejects_out_of_range(fake_k8s, replicas):
    assert "Safety violation" in agent_tools.scale_kubernetes_deployment(replicas=replicas)
    fake_k8s.patch_namespaced_deployment_scale.assert_not_called()


def test_scale_rejects_non_integer(fake_k8s):
    assert "must be an integer" in agent_tools.scale_kubernetes_deployment(replicas=True)


def test_scale_applies_and_records_action(fake_k8s):
    assert agent_tools.scale_kubernetes_deployment(replicas=3).startswith("✅")
    fake_k8s.patch_namespaced_deployment_scale.assert_called_once()
    assert agent_tools.run_outcome["actions"] == ["scale 2->3"]


def test_scale_cooldown_blocks_second_action(fake_k8s):
    agent_tools.scale_kubernetes_deployment(replicas=3)
    assert "cooldown" in agent_tools.scale_kubernetes_deployment(replicas=1)
    assert fake_k8s.patch_namespaced_deployment_scale.call_count == 1


def test_scale_noop_when_already_there(fake_k8s):
    assert agent_tools.scale_kubernetes_deployment(replicas=2).startswith("No-op")
    assert agent_tools.run_outcome["actions"] == []


def test_restart_patches_annotation_records_action_and_cools_down(fake_k8s):
    agent_tools._last_restart_action_at = 0.0
    assert agent_tools.restart_kubernetes_deployment().startswith("✅")
    body = fake_k8s.patch_namespaced_deployment.call_args.kwargs["body"]
    stamp = body["spec"]["template"]["metadata"]["annotations"]["kubectl.kubernetes.io/restartedAt"]
    assert stamp.endswith("Z") and "T" in stamp
    assert agent_tools.run_outcome["actions"] == ["restart"]
    assert "cooldown" in agent_tools.restart_kubernetes_deployment()


def _deployment(desired, updated, available, replicas, generation=2, observed=2):
    dep = mock.MagicMock()
    dep.spec.replicas = desired
    dep.metadata.generation = generation
    dep.status.observed_generation = observed
    dep.status.updated_replicas = updated
    dep.status.available_replicas = available
    dep.status.replicas = replicas
    return dep


def test_rollout_wait_does_not_pass_while_old_pod_still_serves():
    """During a restart the old pod is still 'available': counts alone would pass at once."""
    api = mock.MagicMock()
    api.read_namespaced_deployment.side_effect = [
        _deployment(1, updated=0, available=1, replicas=1, observed=1),  # controller has not seen the patch
        _deployment(1, updated=1, available=1, replicas=2),              # new pod up, old one terminating
        _deployment(1, updated=1, available=1, replicas=1),              # done
    ]
    with mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "AppsV1Api", return_value=api), \
         mock.patch.object(agent_tools.time, "sleep"):
        agent_tools._wait_for_rollout(timeout_seconds=60)
    assert api.read_namespaced_deployment.call_count == 3


# ---------------------------------------------------------------- verification

def verify_with(pre, post):
    """Run the verification with Prometheus returning `post` values."""
    names = {"http_requests_total": "throughput", "histogram_quantile": "latency_p95",
             "cfs_throttled": "cpu_throttling", "container_cpu_usage": "avg_cpu_per_pod",
             "kube_deployment_status_replicas_available": "active_replicas"}

    def fake_get(url, params, timeout):
        q = params["query"]
        key = next(v for k, v in names.items() if k in q)
        resp = mock.MagicMock()
        resp.json.return_value = {"data": {"result": [{"value": [0, str(post[key])]}]}}
        return resp

    with mock.patch.object(agent_tools, "_wait_for_rollout", return_value=5.0), \
         mock.patch.object(agent_tools.time, "sleep"), \
         mock.patch.object(agent_tools.requests, "get", side_effect=fake_get):
        text = agent_tools.verify_metrics_stabilization(json.dumps(pre))
    return agent_tools.run_outcome["verification"], text


def test_verify_scale_up_that_relieves_pressure_is_stable():
    pre = metrics(1, 12.5, cpu=0.83, thr=0.096, p95=0.15)
    post = metrics(2, 14.0, cpu=0.45, thr=0.02, p95=0.12)
    assert verify_with(pre, post)[0] == "STABLE"


def test_verify_scale_up_still_ramping_but_improving_is_stable():
    pre = metrics(2, 24, cpu=0.85, thr=0.09, p95=0.5)
    post = metrics(3, 27, cpu=0.76, thr=0.06, p95=0.4)  # above SLO, but clearly better
    assert verify_with(pre, post)[0] == "STABLE"


def test_verify_scale_down_that_overloads_is_unstable():
    pre = metrics(3, 13, cpu=0.32, thr=0.01, p95=0.12)
    post = metrics(1, 13, cpu=0.9, thr=0.12, p95=0.6)
    assert verify_with(pre, post)[0] == "UNSTABLE"


def test_verify_restart_after_stuck_fault_is_stable():
    """Live case 2026-10-01 09:38: restart fixed the app; the fresh pod read throttling 6.7%
    at CPU 0.52 (8 VUs released at once). That is inside the learned healthy band."""
    pre = metrics(1, 4.0, cpu=0.19, thr=0.023, p95=4.46)
    post = metrics(1, 7.1, cpu=0.52, thr=0.067, p95=0.146)
    assert verify_with(pre, post)[0] == "STABLE"


def test_verify_restart_that_did_not_help_is_unstable():
    pre = metrics(1, 4.0, cpu=0.19, thr=0.023, p95=4.46)
    post = metrics(1, 4.1, cpu=0.2, thr=0.02, p95=4.4)
    assert verify_with(pre, post)[0] == "UNSTABLE"


def test_verify_missing_metric_is_unverifiable():
    assert verify_with({"throughput": 1}, {})[0] == "UNVERIFIABLE"


# ---------------------------------------------------------------- incident memory

class FakeCollection:
    def __init__(self, docs, metas):
        self.docs, self.metas = docs, metas

    def get(self, where, include):
        return {"documents": self.docs, "metadatas": self.metas}


STORED = FakeCollection(
    ["State -> CPU:0.6cores | Throttle:4.5% | Tput:17.0rps | Reps:2",   # old format: parsed
     "State -> CPU:0.2cores | Throttle:0.3% | Tput:6.0rps | Reps:2",
     "State -> CPU:0.83cores | Throttle:9.6% | Tput:13.0rps | Reps:1"],
    [{"action_taken": "scale 2->3", "root_cause": "overload", "status": "resolved"},
     {"action_taken": "scale 2->1", "root_cause": "waste", "status": "resolved",
      "replicas": 2, "cpu": 0.2, "throttling": 0.003, "rps": 6.0, "p95": 0.13},    # new format
     {"action_taken": "scale 1->2", "root_cause": "overload", "status": "resolved"}],
)


def test_memory_returns_waste_incident_for_waste_state():
    with mock.patch.object(agent_tools, "_get_collection", return_value=STORED):
        text = agent_tools.query_knowledge_base("", metrics(2, 5.5, cpu=0.2, thr=0.004, p95=0.13))
    first = text.splitlines()[1]
    assert "scale 2->1" in text.split("Action taken:")[1].splitlines()[0]
    assert "Tput:6.0rps" in first


def test_memory_returns_overload_incident_for_overload_state():
    with mock.patch.object(agent_tools, "_get_collection", return_value=STORED):
        text = agent_tools.query_knowledge_base("", metrics(2, 23, cpu=0.8, thr=0.05, p95=0.2))
    assert "scale 2->3" in text.split("Action taken:")[1].splitlines()[0]


def test_memory_says_no_similar_incident_for_a_stuck_app():
    """A stuck app (p95 4.5 s, low CPU) must not be presented old overload/waste incidents as similar."""
    with mock.patch.object(agent_tools, "_get_collection", return_value=STORED):
        text = agent_tools.query_knowledge_base("", metrics(2, 3.0, cpu=0.12, thr=0.007, p95=4.7))
    assert text.startswith("NO similar past incident")


def test_memory_only_matches_same_replica_count():
    with mock.patch.object(agent_tools, "_get_collection", return_value=STORED):
        text = agent_tools.query_knowledge_base("", metrics(3, 13, cpu=0.3))
    assert text.startswith("No past incidents at 3 replica(s)")


def test_memory_unreachable_is_reported_not_raised():
    with mock.patch.object(agent_tools, "_get_collection", return_value=None):
        assert "unavailable" in agent_tools.query_knowledge_base("", metrics(1, 5))


def test_save_refuses_without_stable_verification():
    agent_tools.reset_run_outcome()
    assert agent_tools.save_resolution_to_chroma("sig", "cause", "scale 1->2").startswith("Refused")


# ---------------------------------------------------------------- rollback

def test_rollback_only_for_scale_down():
    import agent
    with mock.patch.object(agent, "scale_kubernetes_deployment", return_value="✅ ok") as scale:
        assert agent._rollback_failed_scale_down(["scale 1->2"]) is None
        assert agent._rollback_failed_scale_down([]) is None
        assert agent._rollback_failed_scale_down(["restart"]) is None
        assert agent._rollback_failed_scale_down(["scale 3->2"]) == "rollback to 3"
        scale.assert_called_once_with(replicas=3)


# ---------------------------------------------------------------- LLM retry wrapper

def _gen(responses):
    """Patch LiteLLMModel.generate to return / raise the given items in order."""
    import agent
    it = iter(responses)

    def fake(self, *a, **k):
        item = next(it)
        if isinstance(item, Exception):
            raise item
        return item
    return mock.patch.object(agent.LiteLLMModel, "generate", fake), mock.patch.object(agent.time, "sleep")


def test_retry_on_empty_response_then_success():
    import agent
    from smolagents.models import ChatMessage
    p1, p2 = _gen([ChatMessage(role="assistant", content=None),
                   ChatMessage(role="assistant", content="   "),
                   ChatMessage(role="assistant", content="```python\nfinal_answer('ok')\n```")])
    with p1, p2:
        agent.model.reset_stats()
        out = agent.model.generate([])
    assert "final_answer" in out.content
    assert agent.model.stats == {"calls": 3, "retries": 2, "fallback_calls": 0}


def test_retry_on_503_then_success():
    import agent, litellm
    from smolagents.models import ChatMessage
    err = litellm.exceptions.ServiceUnavailableError("high demand", llm_provider="gemini", model="x")
    p1, p2 = _gen([err, ChatMessage(role="assistant", content="ok")])
    with p1, p2:
        agent.model.reset_stats()
        assert agent.model.generate([]).content == "ok"


def test_non_transient_error_is_not_retried():
    import agent
    p1, p2 = _gen([ValueError("bad request")])
    with p1, p2:
        agent.model.reset_stats()
        with pytest.raises(ValueError):
            agent.model.generate([])
    assert agent.model.stats["calls"] == 1


# ---------------------------------------------------------------- rule-based baseline

@pytest.mark.parametrize("state,expected", [
    (metrics(1, 4.5), 1),
    (metrics(1, 13, cpu=0.83, thr=0.096), 2),
    (metrics(1, 25, cpu=0.99, thr=0.3, p95=0.8), 3),
    (metrics(2, 18), 2),
    (metrics(2, 24, cpu=0.83), 3),
    (metrics(2, 17, p95=0.4), 3),
    (metrics(3, 27), 3),
    (metrics(3, 12.6, cpu=0.3), 2),
    (metrics(2, 12.6, cpu=0.45), 2),
    (metrics(2, 5.5, cpu=0.2), 1),
    (metrics(3, 5, cpu=0.1), 1),
])
def test_rule_scaler_decisions(state, expected):
    assert rule_scaler.decide(state) == expected
