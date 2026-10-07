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
    pre = metrics(2, 24, cpu=0.85, thr=0.11, p95=0.3)
    post = metrics(3, 27, cpu=0.76, thr=0.06, p95=0.25)  # CPU above 0.75, but clearly better
    assert verify_with(pre, post)[0] == "STABLE"


def test_verify_scale_up_that_only_dilutes_a_fault_is_unstable():
    """Users still above the SLO: a lower but still broken p95 is not a fix."""
    pre = metrics(1, 4.0, cpu=0.19, thr=0.023, p95=4.46)
    post = metrics(2, 5.5, cpu=0.15, thr=0.02, p95=3.0)
    assert verify_with(pre, post)[0] == "UNSTABLE"


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


def test_incident_log_keeps_unstable_verdict_after_rollback():
    """The rollback goes through the scale tool, which resets run_outcome["verification"];
    the logged verdict must still be the agent action's (UNSTABLE), not empty."""
    import agent
    logged = []

    def fake_run(_prompt):
        agent_tools._record_action("scale 3->1")
        return "Root cause: over-provisioned."

    def fake_verify(_metrics_json):
        agent_tools.run_outcome["verification"] = "UNSTABLE"
        return "UNSTABLE"

    def fake_scale(replicas):
        agent_tools._record_action(f"scale 1->{replicas}")
        return "✅ ok"

    with mock.patch.object(agent.sre_agent, "run", side_effect=fake_run), \
         mock.patch.object(agent, "verify_metrics_stabilization", side_effect=fake_verify), \
         mock.patch.object(agent, "scale_kubernetes_deployment", side_effect=fake_scale), \
         mock.patch.object(agent, "query_knowledge_base", return_value="none"), \
         mock.patch.object(agent, "save_resolution_to_chroma") as save, \
         mock.patch.object(agent, "_log_incident", side_effect=logged.append):
        assert agent.trigger_ai_agent(json.dumps(metrics(3, 5))) is False
    save.assert_not_called()
    assert logged[0]["verification"] == "UNSTABLE"
    assert logged[0]["actions"] == "scale 3->1; rollback to 3"


def test_cpu_per_request_separates_runaway_job_from_overload():
    import agent
    overload = agent._cpu_per_request_context(metrics(1, 12.5, cpu=0.83))   # live v4 baseline run
    runaway = agent._cpu_per_request_context(metrics(2, 5.3, cpu=0.87))     # live cpuhog run, 2 pods
    assert "= 0.9x" in overload
    assert "= 4.5x" in runaway
    assert "not meaningful" in agent._cpu_per_request_context(metrics(1, 0.5))


def test_default_prompt_is_v8():
    """v8 is the final version (default since 2026-10-04); older versions stay opt-in for reproduction."""
    import agent
    if os.getenv("AIOPS_PROMPT") is None:
        assert agent.PROMPT_VERSION == "v8"
        assert "rollback_kubernetes_deployment" in agent.sre_agent.tools
        assert agent.claim_final_answer_check in agent.sre_agent.final_answer_checks


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


def test_retry_when_message_has_no_text_but_tool_calls():
    """2026-10-03: Gemini answered with no text (content None, native tool_calls) 5 times in a row."""
    import agent
    from types import SimpleNamespace
    from smolagents.models import ChatMessage
    p1, p2 = _gen([SimpleNamespace(content=None, tool_calls=["call"]),
                   ChatMessage(role="assistant", content="```python\nfinal_answer('ok')\n```")])
    with p1, p2:
        agent.model.reset_stats()
        assert "final_answer" in agent.model.generate([]).content
    assert agent.model.stats["retries"] == 1


def test_retry_on_503_then_success():
    import agent, litellm
    from smolagents.models import ChatMessage
    err = litellm.exceptions.ServiceUnavailableError("high demand", llm_provider="gemini", model="x")
    p1, p2 = _gen([err, ChatMessage(role="assistant", content="ok")])
    with p1, p2:
        agent.model.reset_stats()
        assert agent.model.generate([]).content == "ok"


def test_fallback_model_after_primary_keeps_failing():
    """4 transient failures of the primary, then the fallback model answers (default gemini-2.5-flash)."""
    import agent, litellm
    from smolagents.models import ChatMessage
    err = litellm.exceptions.ServiceUnavailableError("high demand", llm_provider="gemini", model="x")
    used = []

    def fake(self, *a, **k):
        used.append(self.model_id)
        if self.model_id == agent.PRIMARY_MODEL:
            raise err
        return ChatMessage(role="assistant", content="```python\nfinal_answer('ok')\n```")
    with mock.patch.object(agent.LiteLLMModel, "generate", fake), mock.patch.object(agent.time, "sleep"), \
         mock.patch.object(agent, "FALLBACK_MODEL", "gemini/fallback-model"):
        agent.model.reset_stats()
        assert "final_answer" in agent.model.generate([]).content
    assert used == [agent.PRIMARY_MODEL] * 4 + ["gemini/fallback-model"]
    assert agent.model.stats["fallback_calls"] == 1 and agent.model.model_id == agent.PRIMARY_MODEL


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


# ---------------------------------------------------------------- v6 tools (2026-10-03)
import datetime as _dt  # noqa: E402
from types import SimpleNamespace as NS  # noqa: E402

DEP = "aiops-backend-deployment"
NOW = _dt.datetime.now(_dt.timezone.utc)


def _rs(revision, pod_hash, env=None, restarted="2026-10-03T10:00:00Z", minutes_ago=10, owner=DEP):
    container = NS(image="aiops-backend:latest", resources=NS(limits={"cpu": "1", "memory": "1Gi"}),
                   env=[NS(name=k, value=v) for k, v in (env or {}).items()])
    template = NS(metadata=NS(annotations={"kubectl.kubernetes.io/restartedAt": restarted},
                              labels={"app": "aiops-backend", "pod-template-hash": pod_hash}),
                  spec=NS(containers=[container]))
    return NS(metadata=NS(annotations={"deployment.kubernetes.io/revision": str(revision)},
                          labels={"pod-template-hash": pod_hash},
                          owner_references=[NS(kind="Deployment", name=owner)],
                          creation_timestamp=NOW - _dt.timedelta(minutes=minutes_ago)),
              spec=NS(template=template))


def _pod(name, pod_hash, ready=True, minutes_ago=5):
    return NS(metadata=NS(name=name, labels={"pod-template-hash": pod_hash}, deletion_timestamp=None),
              status=NS(conditions=[NS(type="Ready", status="True" if ready else "False")], phase="Running",
                        start_time=NOW - _dt.timedelta(minutes=minutes_ago)))


@pytest.fixture
def fake_cluster():
    """Two pods of revision 7 (hash h7); revisions 6 (restart only) and 7 (env added)."""
    for name in ["_last_pod_restart_at", "_last_rollback_at"]:
        setattr(agent_tools, name, 0.0)
    agent_tools.reset_run_outcome()
    apps, core = mock.MagicMock(), mock.MagicMock()
    apps.list_namespaced_replica_set.return_value.items = [
        _rs(5, "h5", restarted="2026-10-03T09:00:00Z", minutes_ago=60),
        _rs(6, "h6", minutes_ago=20),
        _rs(7, "h7", env={"FEATURE_X": "true"}, minutes_ago=2),
        _rs(3, "hx", owner="some-other-deployment"),
    ]
    dep = mock.MagicMock()
    dep.metadata.annotations = {"deployment.kubernetes.io/revision": "7"}
    dep.status.available_replicas = 2
    dep.spec.replicas = 2
    apps.read_namespaced_deployment.return_value = dep
    apps.api_client.sanitize_for_serialization.side_effect = lambda t: {
        "metadata": {"labels": dict(t.metadata.labels), "annotations": dict(t.metadata.annotations)},
        "spec": {"containers": [{"env": [{"name": e.name, "value": e.value} for e in t.spec.containers[0].env]}]}}
    core.list_namespaced_pod.return_value.items = [_pod(f"{DEP}-h7-aaaaa", "h7"), _pod(f"{DEP}-h7-bbbbb", "h7")]
    with mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "AppsV1Api", return_value=apps), \
         mock.patch.object(agent_tools.client, "CoreV1Api", return_value=core):
        yield apps, core, dep


def test_pod_breakdown_shows_the_sick_pod(fake_cluster):
    """A runaway job in one pod: high CPU per request and event-loop lag on that pod only."""
    hog, ok = f"{DEP}-h7-aaaaa", f"{DEP}-h7-bbbbb"
    per_query = {"cpu": {hog: 0.95, ok: 0.30}, "throttling": {hog: 0.2, ok: 0.01}, "rps": {hog: 3.0, ok: 4.0},
                 "errors": {}, "p95": {hog: 0.5, ok: 0.1}, "lag": {hog: 1.1, ok: 0.05},
                 "memory": {hog: 120 * 2**20, ok: 118 * 2**20}, "memory_limit": {hog: 2**30, ok: 2**30},
                 "restarts": {hog: 0, ok: 0}}
    by_query = {q: per_query[k] for k, q in agent_tools.POD_QUERIES.items()}
    with mock.patch.object(agent_tools, "_prom_by_pod", side_effect=lambda q: by_query[q]):
        text = agent_tools.get_pod_breakdown()
    hog_line = text.split(hog)[1].split(ok)[0]
    assert "revision 7" in hog_line and "CPU per request 0.317 core-s" in hog_line
    assert "event-loop lag p99 1.10 s" in hog_line and "120 MiB / 1024 MiB limit" in hog_line
    assert "CPU per request 0.075 core-s" in text.split(ok)[1]


def test_deployment_history_names_the_change(fake_cluster):
    text = agent_tools.get_deployment_history()
    lines = text.splitlines()
    assert "revision 7 (CURRENT)" in lines[1] and "env FEATURE_X=true added" in lines[1]
    assert "revision 6" in lines[2] and "rolling restart only" in lines[2]
    assert "some-other" not in text and "revision 3" not in text


def test_pod_restart_guards(fake_cluster):
    apps, core, dep = fake_cluster
    assert "Safety violation" in agent_tools.restart_kubernetes_pod(pod_name="chromadb-deployment-x")
    assert "not found" in agent_tools.restart_kubernetes_pod(pod_name=f"{DEP}-nope")
    dep.status.available_replicas = 1
    assert agent_tools.restart_kubernetes_pod(pod_name=f"{DEP}-h7-aaaaa").startswith("Refused")
    core.delete_namespaced_pod.assert_not_called()
    assert agent_tools.run_outcome["actions"] == []


def test_pod_restart_deletes_records_and_cools_down(fake_cluster):
    apps, core, dep = fake_cluster
    assert agent_tools.restart_kubernetes_pod(pod_name=f"{DEP}-h7-aaaaa").startswith("✅")
    core.delete_namespaced_pod.assert_called_once_with(name=f"{DEP}-h7-aaaaa", namespace="default")
    assert agent_tools.run_outcome["actions"] == [f"restart pod {DEP}-h7-aaaaa"]
    assert "cooldown" in agent_tools.restart_kubernetes_pod(pod_name=f"{DEP}-h7-bbbbb")


def test_rollback_to_previous_revision_replaces_the_template(fake_cluster):
    apps, core, dep = fake_cluster
    assert agent_tools.rollback_kubernetes_deployment().startswith("✅")
    body = apps.patch_namespaced_deployment.call_args.kwargs["body"]
    assert isinstance(body, list) and body[0]["op"] == "replace" and body[0]["path"] == "/spec/template"
    template = body[0]["value"]
    assert "pod-template-hash" not in template["metadata"]["labels"]
    assert template["spec"]["containers"][0]["env"] == []          # FEATURE_X gone (revision 6)
    assert agent_tools.run_outcome["actions"] == ["rollback to revision 6"]
    assert "cooldown" in agent_tools.rollback_kubernetes_deployment()


def test_rollback_guards(fake_cluster):
    apps, core, dep = fake_cluster
    assert agent_tools.rollback_kubernetes_deployment(revision=7).startswith("No-op")
    assert "not found" in agent_tools.rollback_kubernetes_deployment(revision=42)
    assert "Safety violation" in agent_tools.rollback_kubernetes_deployment(revision=-1)
    apps.patch_namespaced_deployment.assert_not_called()


def test_recent_actions_show_failed_action_and_expire():
    import agent
    agent.RECENT_ACTIONS.clear()
    now = 1_000_000.0
    agent.RECENT_ACTIONS.append({"t": now - 120, "woke_at": "2026-10-03 10:00:00",
                                 "actions": ["scale 3->1", "rollback to 3"], "verdict": "UNSTABLE",
                                 "error": "", "answer": ""})
    agent.RECENT_ACTIONS.append({"t": now - 20 * 60, "woke_at": "2026-10-03 09:42:00",
                                 "actions": ["scale 1->2"], "verdict": "STABLE", "error": "", "answer": ""})
    text = agent._recent_actions_text(now)
    assert "scale 3->1; rollback to 3 -> verification UNSTABLE" in text and "2 min ago" in text
    assert "09:42" not in text
    agent.RECENT_ACTIONS.clear()
    assert agent._recent_actions_text(now).startswith("None")


def test_v6_prompt_has_no_fault_specific_hint():
    """v6 must not contain v5's code-computed CPU-per-request rule or v4's mandatory scale-up."""
    import agent
    prompt = agent.V6_PROMPT.format(metrics_json="{}", signature="s", capacity="c", recent="r", memory="m")
    assert "MANDATORY" not in prompt and "2x" not in prompt and "runaway" not in prompt.lower()
    for tool_name in ["get_pod_breakdown", "get_deployment_history", "restart_kubernetes_pod",
                      "rollback_kubernetes_deployment"]:
        assert tool_name in prompt


@pytest.mark.parametrize("state,expected", [
    (metrics(1, 4.0, cpu=0.19, thr=0.02, p95=4.4), "R1"),     # stuck fault
    (metrics(1, 4.2, cpu=0.91, thr=0.18, p95=0.48), "R2"),    # cpuhog fault (0.217 core-s/request)
    (metrics(1, 12.5, cpu=0.83, thr=0.096, p95=0.15), None),  # real overload (0.066): scale, not restart
    (metrics(2, 18, cpu=0.6, thr=0.03, p95=0.12), None),      # healthy
    (metrics(1, 7, cpu=0.61, thr=0.04, p95=0.37), None),      # fresh-pod p95 blip at normal CPU
])
def test_rules_v2_restart_signatures(state, expected):
    reason = rule_scaler.restart_reason(state)
    assert (reason or "").startswith(expected) if expected else reason is None


def test_deployment_history_after_a_rollback(fake_cluster):
    """A rollback re-uses the old ReplicaSet (revision 6 -> 8): the bad revision 7 must stay
    listed with its change, and 8 must say it re-applied 6 and when (from the events)."""
    apps, core, dep = fake_cluster
    rs6 = _rs(8, "h6", minutes_ago=20)
    rs6.metadata.annotations["deployment.kubernetes.io/revision-history"] = "6"
    apps.list_namespaced_replica_set.return_value.items = [
        _rs(5, "h5", restarted="2026-10-03T09:00:00Z", minutes_ago=60), rs6,
        _rs(7, "h7", env={"FEATURE_X": "true"}, minutes_ago=5)]
    dep.metadata.annotations = {"deployment.kubernetes.io/revision": "8"}
    rs6.metadata.name = f"{DEP}-h6"
    core.list_namespaced_event.return_value.items = [
        NS(message=f"Scaled up replica set {DEP}-h6 from 0 to 1", last_timestamp=NOW - _dt.timedelta(minutes=1),
           event_time=None, metadata=NS(creation_timestamp=None))]
    lines = agent_tools.get_deployment_history().splitlines()
    assert "revision 8 (CURRENT): re-applied the template of revision 6" in lines[1]
    assert "(1m" in lines[1] and "env FEATURE_X removed" in lines[1]   # ~1 min ago (suite timing varies)
    assert "revision 7" in lines[2] and "env FEATURE_X=true added" in lines[2]
    assert "revision 6" in lines[3] and "later re-applied as revision 8" in lines[3]


def test_verify_retries_an_empty_prometheus_answer():
    """2026-10-03: a 40 s window right after a rollback returned no CPU value once; one retry later it had data."""
    pre = metrics(1, 2.0, cpu=0.92, thr=0.107, p95=1.4)
    post = metrics(1, 7.2, cpu=0.34, thr=0.05, p95=0.148)
    empty_once = {"done": False}
    real_verify_get = None

    def flaky_get(url, params, timeout):
        resp = mock.MagicMock()
        if "container_cpu_usage" in params["query"] and not empty_once["done"]:
            empty_once["done"] = True
            resp.json.return_value = {"data": {"result": []}}
            return resp
        return real_verify_get(url, params, timeout)

    names = {"http_requests_total": "throughput", "histogram_quantile": "latency_p95",
             "cfs_throttled": "cpu_throttling", "container_cpu_usage": "avg_cpu_per_pod",
             "kube_deployment_status_replicas_available": "active_replicas"}

    def real_verify_get(url, params, timeout):  # noqa: F811
        key = next(v for k, v in names.items() if k in params["query"])
        resp = mock.MagicMock()
        resp.json.return_value = {"data": {"result": [{"value": [0, str(post[key])]}]}}
        return resp

    with mock.patch.object(agent_tools, "_wait_for_rollout", return_value=3.0), \
         mock.patch.object(agent_tools.time, "sleep"), \
         mock.patch.object(agent_tools.requests, "get", side_effect=flaky_get):
        agent_tools.verify_metrics_stabilization(json.dumps(pre))
    assert agent_tools.run_outcome["verification"] == "STABLE"


def test_verify_gives_up_after_repeated_empty_answers():
    def always_empty(url, params, timeout):
        resp = mock.MagicMock()
        resp.json.return_value = {"data": {"result": []}}
        return resp
    with mock.patch.object(agent_tools, "_wait_for_rollout", return_value=3.0), \
         mock.patch.object(agent_tools.time, "sleep") as sleep, \
         mock.patch.object(agent_tools.requests, "get", side_effect=always_empty):
        text = agent_tools.verify_metrics_stabilization(json.dumps(metrics(1, 2.0)))
    assert text.startswith("UNVERIFIABLE: Prometheus returned no value")
    assert sleep.call_count == 1 + agent_tools.VERIFY_QUERY_ATTEMPTS - 1   # settle + retries
