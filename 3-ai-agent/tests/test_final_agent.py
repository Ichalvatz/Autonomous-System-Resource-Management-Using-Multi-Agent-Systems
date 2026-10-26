"""
The final agent (v10, thesis phase 2, 2026-10-26; prompt and tools as v9): its toolset (3 observation tools, scale,
rolling restart of the whole app) and tool descriptions, the prompt's rules, the three code-enforced guards (evidence before action; no
claimed action without a tool call; full diagnosis before a restart), and replays of the three measured incidents
that motivated the guards (phase 1, agents v6/v7), run through a real smolagents CodeAgent with a scripted model.
The computed facts are tested in test_agent_logic.py.

Run from the repo root:  .venv/bin/python3 -m pytest 3-ai-agent/tests -q
"""
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GEMINI_API_KEY", "dummy-for-tests")

import agent  # noqa: E402
import agent_tools  # noqa: E402

OBSERVE = ["get_pod_breakdown", "get_deployment_history", "get_kubernetes_logs"]
ACT = ["scale_kubernetes_deployment", "restart_kubernetes_deployment"]


# ---------------------------------------------------------------- the agent and its prompt

def test_agent_has_the_five_tools_and_the_guards():
    assert list(agent.sre_agent.tools)[:5] == OBSERVE + ACT
    assert not {"restart_kubernetes_pod", "rollback_kubernetes_deployment"} & set(agent.sre_agent.tools)
    step_callbacks = [f for fs in agent.sre_agent.step_callbacks._callbacks.values() for f in fs]
    assert agent.guard_step_done in step_callbacks
    assert agent.claim_final_answer_check in agent.sre_agent.final_answer_checks
    assert agent.guard_final_answer_check in agent.sre_agent.final_answer_checks


def test_prompt_classifies_first_and_has_no_fault_specific_hint():
    p = agent.AGENT_PROMPT.format(metrics_json="{}", signature="s", capacity="c", facts="F", recent="r", memory="m",
                                  nfr_p95=0.35, nfr_errors_pct=1.0, max_pods=3)
    assert "you MUST scale DOWN" in p and "minimum pod count in the facts" in p
    assert "Look at ALL THREE observation tools" in p
    assert "p95 < 0.35 s" in p and "fewer than 1% of requests fail" in p and "at most 3 pods" in p
    assert "not evidence of a cause" in p and "may be a transient" in p
    assert "you have no tool to undo a change" in p
    assert "wakes you again at once if it gets worse or stops improving" in p
    assert "over ~2x" not in p and "MANDATORY" not in p and "0.75" not in p and "throttling <" not in p
    for tool in OBSERVE + ACT:
        assert tool in p


def test_tool_descriptions_agree_with_the_prompt():
    """The LLM reads each tool's docstring. Until 2026-10-11 two of them contradicted the prompt: scale said
    'increased latency -> scale up' and logs said 'only useful when ... errors'. Each action now says what it
    changes and what it leaves unchanged, and the two restarts state their scope."""
    doc = {name: agent.sre_agent.tools[name].description for name in OBSERVE + ACT}
    assert "short of CPU" not in doc["scale_kubernetes_deployment"] and "1 to 3" in doc["scale_kubernetes_deployment"]
    assert "load per pod" in doc["scale_kubernetes_deployment"]
    assert "Only useful" not in doc["get_kubernetes_logs"]
    assert "ALL backend pods" in doc["restart_kubernetes_deployment"]
    assert "new revision" in doc["restart_kubernetes_deployment"]


# ---------------------------------------------------------------- guards

def test_guards_inactive_outside_an_agent_run():
    agent_tools.guard_stop()
    agent_tools._guard_observed()
    assert agent_tools._guard_refusal() is None and agent_tools._diagnosis_refusal() is None
    agent_tools.reset_run_outcome()
    assert agent_tools.claim_final_answer_check("Root cause: x. Action: scaled.", None) is True


def test_guard_ablation_switch():
    agent_tools.guard_start(enforce=False)
    agent_tools._guard_observed()
    assert agent_tools._guard_refusal() is None and agent_tools._diagnosis_refusal() is None
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


def test_diagnosis_rule_refuses_restart_until_all_three_observed():
    agent_tools.guard_start(enforce=True)
    agent_tools._guard_observed("get_pod_breakdown")
    agent_tools.guard_step_done()
    refusal = agent_tools._diagnosis_refusal()
    assert refusal.startswith("Refused (diagnosis first)")
    assert "get_deployment_history()" in refusal and "get_kubernetes_logs()" in refusal
    agent_tools._guard_observed("get_deployment_history")
    agent_tools._guard_observed("get_kubernetes_logs")
    assert agent_tools._diagnosis_refusal() is None
    agent_tools.guard_stop()


def test_diagnosis_rule_never_blocks_scaling():
    agent_tools.guard_start(enforce=True)
    with mock.patch.object(agent_tools, "get_kube_config"), \
         mock.patch.object(agent_tools.client, "AppsV1Api") as apps:
        apps.return_value.read_namespaced_deployment_scale.return_value.spec.replicas = 1
        agent_tools._last_scale_action_at = 0.0
        assert agent_tools.scale_kubernetes_deployment(replicas=2).startswith("✅")   # capacity path unaffected
    agent_tools.guard_stop()


# ---------------------------------------------------------------- replays of measured incidents

def _run_scripted(blocks, replicas_now=2):
    """Run a real CodeAgent (the final tools and hooks) on a scripted model; return the applied k8s calls."""
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
        core.return_value.list_namespaced_event.return_value.items = []
        apps.return_value.list_namespaced_replica_set.return_value.items = []
        apps.return_value.read_namespaced_deployment_scale.return_value.spec.replicas = replicas_now
        apps.return_value.patch_namespaced_deployment.side_effect = lambda **kw: applied.append("restart")
        apps.return_value.patch_namespaced_deployment_scale.side_effect = lambda **kw: applied.append("scale")
        agent_tools._last_restart_action_at = 0.0
        agent_tools._last_scale_action_at = 0.0
        agent_tools.reset_run_outcome()
        a = CodeAgent(tools=[getattr(agent_tools, t) for t in OBSERVE + ACT],
                      model=Scripted(), add_base_tools=False, max_steps=7,
                      step_callbacks=[agent_tools.guard_step_done],
                      final_answer_checks=[agent_tools.guard_final_answer_check, agent_tools.claim_final_answer_check])
        agent_tools.guard_start(enforce=True)
        answer = a.run("incident")
        agent_tools.guard_stop()
    return applied, str(answer)


def test_replay_cpuhog_precommitment_is_refused():
    """Measured 2026-10-03 15:29 (agent v6, cpuhog): step 1 wrote observe + scale(3) + final_answer in one
    block, deciding before it had seen the evidence. The scale-up and the guessed answer are refused; the
    restart goes through once all three observation tools were used."""
    applied, answer = _run_scripted([
        "```python\nprint(get_pod_breakdown())\nscale_kubernetes_deployment(replicas=3)\n"
        "final_answer('Root cause: overload (a guess). Action: scaled to 3.')\n```",
        "```python\nprint(get_deployment_history())\n```",
        "```python\nprint(get_kubernetes_logs())\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nfinal_answer('Root cause: runaway job. Action: rolling restart.')\n```",
    ])
    assert applied == ["restart"] and "runaway" in answer
    assert agent_tools.run_outcome["actions"] == ["restart"]


def test_replay_demo_claimed_action_without_tool_call():
    """Measured 2026-10-03 18:05 (agent v6, demo): the final answer said 'Action: Scale up ... to 3' but no
    tool was called. The answer is refused and the agent executes the scale-up."""
    applied, answer = _run_scripted([
        "```python\nfinal_answer('Root cause: under-provisioned. Action: Scale up the deployment to 3 replicas.')\n```",
        "```python\nprint(scale_kubernetes_deployment(replicas=3))\n```",
        "```python\nfinal_answer('Root cause: under-provisioned. Action: scaled 2->3.')\n```",
    ])
    assert applied == ["scale"]
    assert agent_tools.run_outcome["actions"] == ["scale 2->3"]


def test_replay_badconfig_restart_without_history_is_refused():
    """Measured 2026-10-03 21:08 (agent v7, badconfig): get_pod_breakdown, then a restart (the cause was a
    config change it never looked at). The restart is refused; after history and logs it may act. (The
    badconfig scenario is not part of phase 2; the guard it motivated is.)"""
    applied, _ = _run_scripted([
        "```python\nprint(get_pod_breakdown())\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nprint(get_deployment_history())\n```",
        "```python\nprint(get_kubernetes_logs())\n```",
        "```python\nprint(restart_kubernetes_deployment())\n```",
        "```python\nfinal_answer('Root cause: x. Action: restart.')\n```",
    ])
    assert applied == ["restart"]                         # only the second, fully diagnosed restart
    assert agent_tools.run_outcome["actions"] == ["restart"]
