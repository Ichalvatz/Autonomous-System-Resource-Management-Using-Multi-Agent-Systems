"""
Unit tests for the deterministic parts of the AIOps runtime (agent v10, phase 2): safety guards, the verification
by the health score's trajectory, incident memory in the model's space, the scale-down rollback, the re-wake
signal, the computed facts, the LLM retry wrapper and the observation tools. Kubernetes, Prometheus and
ChromaDB are mocked: nothing touches the cluster. (The rule baseline, pod restart and rollback tools and their
tests were removed on 2026-10-22; git tag v8.1-campaign.)

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
import health_model  # noqa: E402

PARAMS = {"safe_p95": 0.25, "nfr_p95": 0.35, "safe_errors": 0.001, "nfr_errors": 0.01, "pod_separation": 100.0}
BUNDLE = {"params": PARAMS, "noise_eps": 0.15, "memory_similar_max": 0.45,
          "bands": {1: [4.0, 87.0], 2: [73.7, 162.4], 3: [123.7, 251.5]}}


def metrics(reps, rps, p95=0.12, err=0.0, score=None, ready=None):
    m = {"replicas": float(reps), "ready_replicas": float(reps if ready is None else ready), "throughput": rps,
         "rps_per_pod": rps / reps, "latency_p95": p95, "error_rate": err, "avg_cpu_per_pod": 0.4}
    if score is not None:
        m["score"] = score
    return m


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


# ---------------------------------------------------------------- verification (score trajectory)

class FakeClock:
    def __init__(self):
        self.t = 0.0

    def monotonic(self):
        return self.t

    def sleep(self, seconds):
        self.t += seconds


def verify_scores(pre_score, scores, rps=40.0):
    """Run the verification on readings whose health scores are `scores`, one per 10 s after the rollout."""
    readings = [metrics(1, rps, score=s) for s in scores]
    it = iter(readings)
    clock = FakeClock()
    with mock.patch.object(agent_tools, "_wait_for_rollout", return_value=12.0), \
         mock.patch.object(agent_tools, "_health_bundle", return_value=BUNDLE), \
         mock.patch.object(agent_tools.nfr_metrics, "fetch_reading", side_effect=lambda: next(it, readings[-1])), \
         mock.patch.object(agent_tools.health_model, "score", side_effect=lambda _b, r: r["score"]), \
         mock.patch.object(agent_tools.health_model, "explain", return_value=["p95 latency 3.00 s is above ..."]), \
         mock.patch.object(agent_tools.time, "monotonic", side_effect=clock.monotonic), \
         mock.patch.object(agent_tools.time, "sleep", side_effect=clock.sleep):
        text = agent_tools.verify_metrics_stabilization(json.dumps(metrics(1, rps, p95=3.0, score=pre_score)))
    return agent_tools.run_outcome["verification"], text


def test_verify_a_restart_that_fixes_the_app_is_stable_at_the_first_healthy_reading():
    """The stuck run of 2026-10-23 18:49 in v10 scores: the errors leave the 1 m window step by step (the distance
    falls), and the first healthy reading is STABLE (the user's rule, A28)."""
    verdict, text = verify_scores(-63.0, [-100.0, -82.6, -62.4, -42.4, -22.6, -2.1, 0.8, 0.9])
    assert verdict == "STABLE"
    assert agent_tools.run_outcome["recovery_s"] == 12 + 60 and agent_tools.run_outcome["score_after"] == 0.8
    assert "before the action -63.00" in text


def test_verify_a_scale_up_that_only_dilutes_a_fault_is_unstable_not_improving():
    verdict, text = verify_scores(-50.0, [-50.0] * 12)
    assert verdict == "UNSTABLE" and "not improving" in text.splitlines()[0]
    assert "Still outside the healthy range" in text


def test_verify_a_scale_down_that_overloads_is_unstable_worse():
    verdict, text = verify_scores(-0.10, [-0.1 - 0.5 * i for i in range(10)])
    assert verdict == "UNSTABLE" and "worse" in text.splitlines()[0]


def test_verify_waits_while_the_score_keeps_improving():
    verdict, _ = verify_scores(-0.9, [-0.9 + 0.1 * i for i in range(12)])
    assert verdict == "STABLE"


def test_verify_still_anomalous_after_the_time_limit_is_unstable():
    # +0.06 every 10 s: 0.18 over 30 s, more than eps, so always "improving", never healthy within 240 s
    verdict, text = verify_scores(-2.0, [-2.0 + 0.06 * i for i in range(40)])
    assert verdict == "UNSTABLE" and "still anomalous after 4 min" in text


def test_verify_without_any_usable_reading_is_unverifiable():
    clock = FakeClock()
    with mock.patch.object(agent_tools, "_wait_for_rollout", return_value=5.0), \
         mock.patch.object(agent_tools, "_health_bundle", return_value=BUNDLE), \
         mock.patch.object(agent_tools.nfr_metrics, "fetch_reading", return_value=None), \
         mock.patch.object(agent_tools.time, "monotonic", side_effect=clock.monotonic), \
         mock.patch.object(agent_tools.time, "sleep", side_effect=clock.sleep):
        text = agent_tools.verify_metrics_stabilization(json.dumps(metrics(1, 40, score=-0.5)))
    assert text.startswith("UNVERIFIABLE") and agent_tools.run_outcome["verification"] == "UNVERIFIABLE"


@pytest.mark.parametrize("scores,judge_from,full_at,expected", [
    ([0.1], 0, None, "STABLE"),                          # the user's rule: one healthy reading is STABLE
    ([-0.5, 0.1], None, None, "STABLE"),                 # also before the comparisons start (+10 s, A31)
    ([-0.5, -0.9], None, None, "WAIT"),                  # before it, a fall may be the dip right after the action
    # the scale 1->2 of campaign-2026-10-28: the reading right after the rollout dips, then the score rises; judged
    # from it (index 0) this was a false "worse", from +10 s (index 1) it waits and the next reading rises
    ([-1.58, -3.86], 0, None, "UNSTABLE: worse"),
    ([-1.58, -3.86], 1, None, "WAIT"),
    ([-1.58, -3.86, -2.9], 1, None, "WAIT"),
    ([-0.5] * 6 + [-0.6], 6, 6, "WAIT"),                 # one reading to judge: nothing to compare yet
    ([-0.5] * 6 + [-0.6, -0.62], 6, 6, "WAIT"),          # a fall within the noise
    ([-0.5] * 6 + [-0.6, -0.8], 6, 6, "UNSTABLE: worse"),  # a fall beyond the noise
    ([-0.5, -0.6, -0.8], 1, None, "UNSTABLE: worse"),    # a fall is real while the window still mixes (A31.1)
    ([-1.0] * 10, 1, 6, "UNSTABLE: not improving"),      # no rise beyond the noise over 30 s, on post-action windows
    # the smoke run of 2026-11-01 18:04 (A31.1): after a right scale 1->2 the window's p95 stayed at 0.48 s for 40 s;
    # "not improving" waits for windows of post-action data only, and the next reading was healthy
    ([-2.0, -1.96, -1.93, -1.89, -1.82], 1, None, "WAIT"),
    ([-2.0, -1.96, -1.93, -1.89, -1.82, 1.0], 1, None, "STABLE"),
    ([-0.9, -0.7, -0.5, -0.3], 0, 0, "WAIT"),            # moving back towards healthy
    # the smoke run of 2026-10-23 06:32 (v9 called it "worse"): the first post-action reading is already healthy
    ([-0.537] * 6 + [0.061], 1, 6, "STABLE"),
    # the stuck run of 2026-10-23 18:49 in v10 scores: the distance falls as the errors leave the window
    ([-100.0, -82.6, -62.4, -42.4, -22.6, -2.1, 0.8], 1, 6, "STABLE"),
    ([-100.0, -82.6, -62.4, -42.4, -22.6, -2.1], 1, None, "WAIT"),
])
def test_judge_trajectory(scores, judge_from, full_at, expected):
    assert health_model.judge_trajectory(scores, 0.05, judge_from, full_at).startswith(expected)


# ---------------------------------------------------------------- incident memory (the model's space)

class FakeCollection:
    """The ChromaDB calls the memory uses; distances are squared L2 like ChromaDB's default."""
    def __init__(self, items=()):
        self.items = list(items)   # (id, embedding, document, metadata)

    def count(self):
        return len(self.items)

    def get(self, where, include):
        return {"ids": [i for i, _, _, m in self.items if m["status"] == where["status"]]}

    def query(self, query_embeddings, n_results, where, include):
        q = query_embeddings[0]
        hits = sorted(((sum((a - b) ** 2 for a, b in zip(q, e)), d, m) for _, e, d, m in self.items
                       if m["status"] == where["status"]), key=lambda h: h[0])[:n_results]
        return {"distances": [[h[0] for h in hits]], "documents": [[h[1] for h in hits]],
                "metadatas": [[h[2] for h in hits]]}

    def add(self, ids, embeddings, documents, metadatas):
        self.items += list(zip(ids, embeddings, documents, metadatas))


def _stored(state, action, status="resolved"):
    return (f"id-{action}", health_model.embedding({"params": PARAMS}, state), f"state for {action}",
            {"status": status, "actions": action, "recovery_s": 70, "diagnosis": f"why {action}", "time": "t"})


STORED = [
    _stored(metrics(2, 170, p95=0.45), "scale 2->3"),           # overload at 2 pods
    _stored(metrics(2, 30), "scale 2->1"),                      # waste at 2 pods
    _stored(metrics(1, 40, p95=3.0, err=0.6), "restart"),       # stuck at 1 pod
    _stored(metrics(2, 30), "scale 2->1 FAILED", "failed"),     # failures are never returned
]


def memory_for(state, items=STORED):
    with mock.patch.object(agent_tools, "_get_collection", return_value=FakeCollection(items)), \
         mock.patch.object(agent_tools, "_health_bundle", return_value=BUNDLE):
        return agent_tools.query_knowledge_base(state)


def test_memory_returns_the_waste_incident_for_a_waste_state():
    text = memory_for(metrics(2, 32))
    assert "scale 2->1 -> verified STABLE" in text.split("\n")[1] + text.split("\n")[2]
    assert "FAILED" not in text


def test_memory_returns_the_overload_incident_for_an_overload_state():
    text = memory_for(metrics(2, 165, p95=0.5))
    assert text.splitlines()[0].startswith("1 similar verified past incident(s) of 3 stored")
    assert "scale 2->3" in text.splitlines()[2] and "scale 2->1" not in text   # the far one is not listed


def test_memory_says_no_similar_incident_for_a_different_situation():
    """A stuck app at 3 pods must not be shown 2-pod capacity incidents as similar (the pod count is far apart)."""
    text = memory_for(metrics(3, 120, p95=3.0, err=0.3))
    assert text.startswith("NO similar past incident")


def test_memory_without_verified_incidents_and_unreachable():
    assert memory_for(metrics(1, 40), items=[STORED[3]]).startswith("No verified past incidents yet (1 stored")
    with mock.patch.object(agent_tools, "_get_collection", return_value=None):
        assert "unavailable" in agent_tools.query_knowledge_base(metrics(1, 5))


def test_save_incident_stores_status_embedding_and_trajectory():
    collection = FakeCollection()
    agent_tools.reset_run_outcome()
    agent_tools.run_outcome.update(detail="STABLE\nHealth score: ...", recovery_s=85, score_after=0.07)
    state = {**metrics(1, 40, p95=3.0, err=0.5, score=-1.1), "explanation": ["p95 latency 3.00 s is above ..."]}
    with mock.patch.object(agent_tools, "_get_collection", return_value=collection), \
         mock.patch.object(agent_tools, "_health_bundle", return_value=BUNDLE):
        assert agent_tools.save_incident(state, ["restart"], "STABLE", "Root cause: pool leak", "v10").startswith(
            "Success: incident saved as resolved")
        agent_tools.save_incident(state, ["scale 1->2"], "UNSTABLE", "", "v10")
    (_, emb, doc, meta), (_, _, _, meta2) = collection.items
    assert emb == health_model.embedding({"params": PARAMS}, state)
    assert meta["status"] == "resolved" and meta["recovery_s"] == 85 and meta["score_before"] == -1.1
    assert meta["actions"] == "restart" and meta["agent_version"] == "v10" and "p95 latency 3.00 s" in doc
    assert meta2["status"] == "failed"


# ---------------------------------------------------------------- rollback

def test_rollback_only_for_scale_down():
    import agent
    with mock.patch.object(agent, "scale_kubernetes_deployment", return_value="✅ ok") as scale:
        assert agent._rollback_failed_scale_down(["scale 1->2"]) is None
        assert agent._rollback_failed_scale_down([]) is None
        assert agent._rollback_failed_scale_down(["restart"]) is None
        assert agent._rollback_failed_scale_down(["scale 3->2"]) == "rollback to 3"
        scale.assert_called_once_with(replicas=3)


def _trigger(actions, verdict, detail=None):
    """Run trigger_ai_agent with a fake LLM that applies `actions` and a fake verification returning `verdict`."""
    import agent
    logged = []

    def fake_run(_prompt):
        for a in actions:
            agent_tools._record_action(a)
        return "Root cause: ..."

    def fake_verify(_metrics_json):
        agent_tools.run_outcome.update(verification=verdict, detail=detail or verdict)
        return detail or verdict

    def fake_scale(replicas):
        agent_tools._record_action(f"scale 1->{replicas}")
        return "✅ ok"

    with mock.patch.object(agent.sre_agent, "run", side_effect=fake_run), \
         mock.patch.object(agent, "verify_metrics_stabilization", side_effect=fake_verify), \
         mock.patch.object(agent, "scale_kubernetes_deployment", side_effect=fake_scale), \
         mock.patch.object(agent, "query_knowledge_base", return_value="none"), \
         mock.patch.object(agent, "save_incident", return_value="Success: saved") as save, \
         mock.patch.object(agent, "_log_incident", side_effect=logged.append):
        result = agent.trigger_ai_agent(json.dumps(metrics(3, 30, score=-0.2)))
    return result, logged[0], save


def test_failed_scale_down_is_rolled_back_logged_saved_as_failed_and_not_rewoken():
    """The rollback goes through the scale tool, which resets run_outcome; the logged verdict must still be the
    agent action's (UNSTABLE). Code already undid it, so no re-wake."""
    result, row, save = _trigger(["scale 3->1"], "UNSTABLE", "UNSTABLE: worse than before the action")
    assert result == {"resolved": False, "rewake": False, "verdict": "UNSTABLE: worse than before the action"}
    assert row["verification"] == "UNSTABLE" and row["actions"] == "scale 3->1; rollback to 3"
    assert save.call_args.args[2] == "UNSTABLE"


def test_failed_restart_asks_for_a_rewake():
    result, row, _ = _trigger(["restart"], "UNSTABLE", "UNSTABLE: not improving (...)")
    assert result["rewake"] is True and row["rewake"] is True


def test_stable_action_is_resolved_and_saved():
    result, row, save = _trigger(["restart"], "STABLE")
    assert result["resolved"] is True and result["rewake"] is False and row["saved_to_memory"] is True
    save.assert_called_once()


def test_no_action_is_not_verified_or_saved():
    result, row, save = _trigger([], "")
    assert result["resolved"] is True and row["actions"] == "" and row["verification"] == ""
    save.assert_not_called()


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


def test_logs_select_backend_pods_by_label(fake_cluster):
    """Fixed 2026-10-11: the selector was app=aiops-backend-deployment (no pod has it), so every call fell
    back to listing all pods of the namespace. Now one call with the pods' real label."""
    _, core, _ = fake_cluster
    core.read_namespaced_pod_log.return_value = "GET /login 200\n[ERROR] DB connection pool exhausted\n"
    text = agent_tools.get_kubernetes_logs()
    core.list_namespaced_pod.assert_called_once_with(namespace="default", label_selector="app=aiops-backend")
    assert f"--- Pod {DEP}-h7-aaaaa: 2 lines scanned, 1 warnings/errors ---" in text
    assert text.count("[ERROR] DB connection pool exhausted") == 2


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


# ---------------------------------------------------------------- computed facts (v10)

def _fake_min_pods(_bundle, rps):
    """The smallest count whose band (BUNDLE["bands"]) holds rps, as health_model.min_healthy_pods would say."""
    bands = sorted(BUNDLE["bands"].items())
    fits = [n for n, (lo, hi) in bands if lo <= rps <= hi]
    return (fits[0], True) if fits else (next((n for n, (lo, hi) in bands if rps <= hi), bands[-1][0]), False)


def test_facts_take_the_minimum_pod_count_from_the_health_model_and_the_load_trend():
    import agent
    with mock.patch.object(agent, "_health_bundle", return_value=BUNDLE), \
         mock.patch.object(agent.health_model, "min_healthy_pods", side_effect=_fake_min_pods):
        over = agent._computed_facts(metrics(1, 120, score=-1.3, p95=0.5))
        ramp = agent._computed_facts({**metrics(2, 158, p95=0.24, score=-0.2), "load_trend_rps_per_min": 22.0})
        steady = agent._computed_facts({**metrics(2, 120, score=-0.4), "load_trend_rps_per_min": 0.5})
        stuck = agent._computed_facts({**metrics(1, 57, p95=3.0, score=-63.0, ready=0),
                                       "explanation": ["64.0% of requests fail (5xx)"]})
        waste = agent._computed_facts({**metrics(3, 105, score=-0.37), "load_trend_rps_per_min": -15.0})
        beyond = agent._computed_facts(metrics(3, 300, score=-0.5))
        idle = agent._computed_facts(metrics(1, 2, score=-1.4))
        idle3 = agent._computed_facts(metrics(3, 2, score=-2.0))
    assert "healthy for this load: 2. Current: 1." in over and "for 1 pod(s) is 4-87 rps: the load is ABOVE it" in over
    # the smoke run of 2026-10-23 05:04: 158 rps on 2 pods and rising is a capacity case, not a transient
    assert "RISING +22.0 rps per minute" in ramp and "for the 191 rps the trend reaches in 90 s" in ramp
    assert ": 3. Current: 2." in ramp
    assert "steady" in steady and ": 2. Current: 2." in steady and "inside it, so the load alone does not" in steady
    assert "Only 0 of 1 pod(s) are ready" in stuck and "Health score -63.00" in stuck and ": 1. Current: 1." in stuck
    assert ": 2. Current: 3." in waste and "falling" in waste and "BELOW it (over-provisioned)" in waste
    assert "3 (the maximum allowed: no pod count is healthy for this load)" in beyond
    # below every band (v12, A31): the smallest count, not the largest (v10 / v11 said "minimum 3" for 1 pod at 2 rps)
    assert ": 1 (the smallest count: the load is below every pod count's healthy band). Current: 1." in idle
    assert ": 1 (the smallest count" in idle3 and "Current: 3." in idle3


def test_prompt_classifies_by_the_minimum_pod_count_and_states_the_nfrs():
    import agent
    p = agent.AGENT_PROMPT
    assert "the minimum pod count in the facts differs from the current count" in p
    assert "The minimum is HIGHER than now" in p and "you MUST scale DOWN" in p
    assert "at least one more than now" not in p
    filled = p.format(metrics_json="{}", signature="s", capacity="c", facts="f", recent="r", memory="m",
                      nfr_p95=0.35, nfr_errors_pct=1.0, max_pods=3)
    assert "p95 < 0.35 s" in filled and "fewer than 1% of requests" in filled and "at most 3 pods" in filled
