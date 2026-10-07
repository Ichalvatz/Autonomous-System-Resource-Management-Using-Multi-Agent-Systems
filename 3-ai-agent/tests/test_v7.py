"""
Prompt v7 (the final version, 2026-10-03): computed capacity facts, the two code-enforced guards
(evidence before action; no claimed action without a tool call), and replays of the two v6 incidents
that motivated them through a real smolagents CodeAgent with a scripted model.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import json
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GEMINI_API_KEY", "dummy-for-tests")

import agent  # noqa: E402
import agent_tools  # noqa: E402


def m(reps, rps, cpu=0.5, thr=0.02, p95=0.12):
    return {"active_replicas": float(reps), "throughput": rps, "avg_cpu_per_pod": cpu,
            "cpu_throttling": thr, "latency_p95": p95}


# ---------------------------------------------------------------- computed facts

@pytest.mark.parametrize("state,needed,ratio", [
    (m(1, 13.0, cpu=0.83), "2.", "0.9x"),                 # real overload: load explains it
    (m(3, 5.0, cpu=0.1), "1.", "0.8x"),                   # waste: scale down to 1
    (m(2, 14.0, cpu=0.5), "2.", "1.0x"),                  # correctly provisioned
    (m(1, 4.2, cpu=0.91), "1.", "3.0x"),                  # cpuhog: 1 pod would be enough, CPU is not the load
])
def test_facts_give_minimum_replicas_and_cpu_per_request(state, needed, ratio):
    facts = agent._computed_facts(state)
    assert f"covers this load: {needed}" in facts
    assert f"= {ratio} the healthy reference" in facts


def test_facts_beyond_capacity_and_low_traffic():
    assert "the maximum allowed" in agent._computed_facts(m(3, 35.0, cpu=0.95))
    assert "not meaningful below 1 rps" in agent._computed_facts(m(1, 0.5))


def test_v7_prompt_restores_scale_down_and_keeps_no_fault_rule():
    prompt = agent.V7_PROMPT.format(metrics_json="{}", signature="s", capacity="c", facts="F", recent="r", memory="m")
    assert "you MUST scale DOWN" in prompt and "minimum replica count in the facts" in prompt
    assert "normal load imbalance, not a fault" in prompt
    assert "over ~2x" not in prompt and "MANDATORY" not in prompt
    for tool in ["get_pod_breakdown", "get_deployment_history", "restart_kubernetes_pod", "rollback_kubernetes_deployment"]:
        assert tool in prompt


# ---------------------------------------------------------------- guards

def test_guards_inactive_unless_started():
    """v4/v5/v6 never call guard_start: an observation followed by an action is not refused."""
    agent_tools.guard_stop()
    agent_tools._guard_observed()
    assert agent_tools._guard_refusal() is None
    agent_tools.reset_run_outcome()
    assert agent_tools.claim_final_answer_check("Root cause: x. Action: scaled.", None) is True


def test_guard_ablation_switch():
    agent_tools.guard_start(enforce=False)
    agent_tools._guard_observed()
    assert agent_tools._guard_refusal() is None
    agent_tools.guard_stop()


def test_claim_check_accepts_no_action_and_real_actions():
    agent_tools.guard_start(enforce=True)
    agent_tools.reset_run_outcome()
    assert agent_tools.claim_final_answer_check("No action taken: healthy", None) is True
    with pytest.raises(ValueError):
        agent_tools.claim_final_answer_check("Root cause: overload. Action: Scale up to 3.", None)
    agent_tools._record_action("scale 2->3")
    assert agent_tools.claim_final_answer_check("Root cause: overload. Action: scaled 2->3.", None) is True
    agent_tools.guard_stop()


def _run_scripted(blocks, replicas_now=2):
    """Run a real CodeAgent (v7 tools and hooks) on a scripted model; return the applied k8s calls."""
    from smolagents import CodeAgent
    from smolagents.models import ChatMessage, Model
    it = iter(blocks)

    class Scripted(Model):
        def generate(self, messages, **kwargs):
            return ChatMessage(role="assistant", content=next(it))

    applied = []
    with mock.patch.object(agent_tools, "_prom_by_pod", return_value={}), \
         mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "CoreV1Api") as core, \
         mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        core.return_value.list_namespaced_pod.return_value.items = []
        apps.return_value.read_namespaced_deployment_scale.return_value.spec.replicas = replicas_now
        apps.return_value.patch_namespaced_deployment.side_effect = lambda **kw: applied.append("restart")
        apps.return_value.patch_namespaced_deployment_scale.side_effect = lambda **kw: applied.append("scale")
        agent_tools._last_restart_action_at = 0.0
        agent_tools._last_scale_action_at = 0.0
        agent_tools.reset_run_outcome()
        a = CodeAgent(tools=[agent_tools.get_pod_breakdown, agent_tools.get_deployment_history,
                             agent_tools.get_kubernetes_logs, agent_tools.scale_kubernetes_deployment,
                             agent_tools.restart_kubernetes_deployment],
                      model=Scripted(), add_base_tools=False, max_steps=5,
                      step_callbacks=[agent_tools.guard_step_done],
                      final_answer_checks=[agent_tools.guard_final_answer_check, agent_tools.claim_final_answer_check])
        agent_tools.guard_start(enforce=True)
        answer = a.run("incident")
        agent_tools.guard_stop()
    return applied, str(answer)


def test_replay_v6_cpuhog_precommitment_is_refused():
    """v6 cpuhog run 15:29, step 1: observe + scale(3) + final_answer in one block. With the guards the
    scale-up and the guessed answer are refused; the restart decided in the next step goes through."""
    applied, answer = _run_scripted([
        "```python\nprint(get_pod_breakdown())\nscale_kubernetes_deployment(replicas=3)\n"
        "final_answer('Root cause: overload (a guess). Action: scaled to 3.')\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nfinal_answer('Root cause: runaway job. Action: rolling restart.')\n```",
    ])
    assert applied == ["restart"] and "runaway" in answer
    assert agent_tools.run_outcome["actions"] == ["restart"]


def test_replay_v6_demo_claimed_action_without_tool_call():
    """v6 demo run 18:05: final answer said 'Action: Scale up ... to 3' but no tool was called.
    With the claim check the answer is refused and the agent executes the scale-up."""
    applied, answer = _run_scripted([
        "```python\nfinal_answer('Root cause: under-provisioned. Action: Scale up the deployment to 3 replicas.')\n```",
        "```python\nprint(scale_kubernetes_deployment(replicas=3))\n```",
        "```python\nfinal_answer('Root cause: under-provisioned. Action: scaled 2->3.')\n```",
    ])
    assert applied == ["scale"]
    assert agent_tools.run_outcome["actions"] == ["scale 2->3"]
