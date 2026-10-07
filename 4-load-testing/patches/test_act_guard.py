"""
Evidence-before-action guard (AIOPS_ACT_GUARD=on): an action or final answer written in the same
LLM step as an observation is refused; the next step may act. Includes a replay of the 2026-10-03
v6 cpuhog incident through a real smolagents CodeAgent with a scripted model.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GEMINI_API_KEY", "dummy-for-tests")

import agent_tools  # noqa: E402


@pytest.fixture
def guard_on():
    with mock.patch.object(agent_tools, "ACT_GUARD", True):
        agent_tools.guard_start()
        yield
        agent_tools.guard_stop()


def test_guard_is_off_by_default():
    if os.getenv("AIOPS_ACT_GUARD") is None:
        assert agent_tools.ACT_GUARD is False
    agent_tools.guard_start()
    agent_tools._guard_observed()
    assert agent_tools._guard_refusal() is None
    agent_tools.guard_stop()


def test_action_in_the_observing_step_is_refused_then_allowed(guard_on):
    agent_tools.reset_run_outcome()
    agent_tools._guard_observed()
    assert agent_tools.scale_kubernetes_deployment(replicas=3).startswith("Refused (evidence before action)")
    assert agent_tools.restart_kubernetes_deployment().startswith("Refused (evidence before action)")
    assert agent_tools.run_outcome["actions"] == []
    with pytest.raises(ValueError):
        agent_tools.guard_final_answer_check("Root cause: guess", None)
    agent_tools.guard_step_done()                       # the LLM has now seen the output
    assert agent_tools._guard_refusal() is None
    assert agent_tools.guard_final_answer_check("Root cause: evidence", None) is True


def test_guard_inactive_outside_an_agent_run():
    """The code-side rollback of a failed scale-down runs after the agent: never blocked."""
    with mock.patch.object(agent_tools, "ACT_GUARD", True):
        agent_tools.guard_start()
        agent_tools._guard_observed()
        agent_tools.guard_stop()
        assert agent_tools._guard_refusal() is None


def test_replay_of_the_cpuhog_precommitment_through_a_real_code_agent():
    """Step 1 writes observation + scale(3) + final_answer in one block (as the LLM did on 2026-10-03).
    With the guard the scale-up and the guessed answer are refused; step 2 (having seen the
    observation) restarts, which goes through."""
    from smolagents import CodeAgent
    from smolagents.models import ChatMessage, Model

    blocks = iter([
        "Thought: check\n```python\nprint(get_pod_breakdown())\n"
        "scale_kubernetes_deployment(replicas=3)\nfinal_answer('Root cause: overload (a guess)')\n```",
        "Thought: the pod burns CPU without traffic\n```python\n"
        "print(restart_kubernetes_deployment())\nfinal_answer('Root cause: runaway job')\n```",
    ])

    class Scripted(Model):
        def generate(self, messages, **kwargs):
            return ChatMessage(role="assistant", content=next(blocks))

    applied = []
    with mock.patch.object(agent_tools, "ACT_GUARD", True), \
         mock.patch.object(agent_tools, "_prom_by_pod", return_value={}), \
         mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "CoreV1Api") as core, \
         mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        core.return_value.list_namespaced_pod.return_value.items = []
        apps.return_value.patch_namespaced_deployment.side_effect = lambda **kw: applied.append("restart")
        apps.return_value.patch_namespaced_deployment_scale.side_effect = lambda **kw: applied.append("scale")
        agent_tools._last_restart_action_at = 0.0
        agent_tools._last_scale_action_at = 0.0
        agent_tools.reset_run_outcome()
        agent = CodeAgent(tools=[agent_tools.get_pod_breakdown, agent_tools.scale_kubernetes_deployment,
                                 agent_tools.restart_kubernetes_deployment],
                          model=Scripted(), add_base_tools=False, max_steps=4,
                          step_callbacks=[agent_tools.guard_step_done],
                          final_answer_checks=[agent_tools.guard_final_answer_check])
        agent_tools.guard_start()
        answer = agent.run("incident")
        agent_tools.guard_stop()
    assert applied == ["restart"]
    assert agent_tools.run_outcome["actions"] == ["restart"]
    assert "runaway" in str(answer)
