"""
Prompt v8 (2026-10-03 21:45) = v7 + "diagnosis before a disruptive action" (a restart, pod restart or
rollback is refused until all three observation tools were used in the run) + an evidence-based restart
rule in the prompt. Includes a replay of the v7 badconfig incident of 21:08 (restart after looking only
at the per-pod view) through a real smolagents CodeAgent.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import os
import sys
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GEMINI_API_KEY", "dummy-for-tests")

import agent  # noqa: E402
import agent_tools  # noqa: E402


def test_diagnosis_rule_refuses_restart_until_all_three_observed():
    agent_tools.guard_start(enforce=True, require_diagnosis=True)
    agent_tools._guard_observed("get_pod_breakdown")
    agent_tools.guard_step_done()
    refusal = agent_tools._diagnosis_refusal()
    assert refusal.startswith("Refused (diagnosis first)")
    assert "get_deployment_history()" in refusal and "get_kubernetes_logs()" in refusal
    agent_tools._guard_observed("get_deployment_history")
    agent_tools._guard_observed("get_kubernetes_logs")
    assert agent_tools._diagnosis_refusal() is None
    agent_tools.guard_stop()


def test_diagnosis_rule_is_v8_only_and_never_blocks_scaling():
    agent_tools.guard_start(enforce=True)                 # v7: no diagnosis rule
    assert agent_tools._diagnosis_refusal() is None
    agent_tools.guard_stop()
    agent_tools.guard_start(enforce=True, require_diagnosis=True)
    with mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        apps.return_value.read_namespaced_deployment_scale.return_value.spec.replicas = 1
        agent_tools._last_scale_action_at = 0.0
        assert agent_tools.scale_kubernetes_deployment(replicas=2).startswith("✅")   # capacity path unaffected
    agent_tools.guard_stop()


def test_v8_prompt_orders_change_first_and_asks_for_evidence():
    p = agent.V8_PROMPT.format(metrics_json="{}", signature="s", capacity="c", facts="F", recent="r", memory="m")
    assert "Look at ALL THREE observation tools" in p
    assert p.index("A change to the deployment shortly before") < p.index("EVIDENCE of a bad state")
    assert "not evidence of a cause" in p and "may be a transient" in p
    assert "you MUST scale DOWN" in p and "over ~2x" not in p and "MANDATORY" not in p


def test_replay_v7_badconfig_restart_without_history_is_refused():
    """v7 badconfig run 21:08: get_pod_breakdown, then restart (the cause was a config change it never
    looked at). With v8's rule the restart is refused; after history and logs it may act."""
    from smolagents import CodeAgent
    from smolagents.models import ChatMessage, Model
    blocks = iter([
        "```python\nprint(get_pod_breakdown())\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nprint(get_deployment_history())\n```",
        "```python\nprint(get_kubernetes_logs())\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nfinal_answer('Root cause: x. Action: restart.')\n```",
    ])

    class Scripted(Model):
        def generate(self, messages, **kwargs):
            return ChatMessage(role="assistant", content=next(blocks))

    applied = []
    with mock.patch.object(agent_tools, "_prom_by_pod", return_value={}), \
         mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "CoreV1Api") as core, \
         mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        core.return_value.list_namespaced_pod.return_value.items = []
        core.return_value.list_namespaced_event.return_value.items = []
        apps.return_value.list_namespaced_replica_set.return_value.items = []
        apps.return_value.patch_namespaced_deployment.side_effect = lambda **kw: applied.append("restart")
        agent_tools._last_restart_action_at = 0.0
        agent_tools.reset_run_outcome()
        a = CodeAgent(tools=[agent_tools.get_pod_breakdown, agent_tools.get_deployment_history,
                             agent_tools.get_kubernetes_logs, agent_tools.restart_kubernetes_deployment],
                      model=Scripted(), add_base_tools=False, max_steps=7,
                      step_callbacks=[agent_tools.guard_step_done],
                      final_answer_checks=[agent_tools.guard_final_answer_check, agent_tools.claim_final_answer_check])
        agent_tools.guard_start(enforce=True, require_diagnosis=True)
        a.run("incident")
        agent_tools.guard_stop()
    assert applied == ["restart"]                         # only the second, fully diagnosed restart
    assert agent_tools.run_outcome["actions"] == ["restart"]
