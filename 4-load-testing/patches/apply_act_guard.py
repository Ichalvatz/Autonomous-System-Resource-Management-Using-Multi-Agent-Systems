"""Apply the evidence-before-action guard (AIOPS_ACT_GUARD) to a 3-ai-agent directory.
Usage: python 4-load-testing/patches/apply_act_guard.py 3-ai-agent   (run by v6_queue3.sh after the frozen-v6 runs)"""
import sys, os
d = sys.argv[1]
p = os.path.join(d, "agent_tools.py")
s = open(p).read()

guard = '''

# --- Evidence-before-action guard (AIOPS_ACT_GUARD=on; added 2026-10-03 evening, after the v6 runs) ---
# In the v6 cpuhog run of 2026-10-03 the LLM wrote observation + scale-up + final_answer in ONE code
# block: it decided before it had seen the evidence (only a syntax error stopped the scale-up). The
# prompt's "one tool per turn" is a request, not a guarantee. This makes it a rule enforced by code:
# while an agent run is active, an action tool or a final answer in the same step as an observation
# tool is refused, and the LLM decides in its next step with the observation output in front of it.
ACT_GUARD = os.getenv("AIOPS_ACT_GUARD", "off").lower() == "on"
_guard = {"active": False, "step": 0, "observed_in": None}
GUARD_MESSAGE = ("Refused (evidence before action): you called an observation tool in this same step, "
                 "so you have not seen its output yet. Read the output first, then decide in your next step.")


def guard_start():
    _guard.update(active=True, step=0, observed_in=None)


def guard_stop():
    _guard["active"] = False


def guard_step_done(*_args, **_kwargs):
    """smolagents step callback: one LLM step (one code block) has finished."""
    _guard["step"] += 1


def _guard_observed():
    _guard["observed_in"] = _guard["step"]


def _guard_refusal():
    if ACT_GUARD and _guard["active"] and _guard["observed_in"] == _guard["step"]:
        return GUARD_MESSAGE
    return None


def guard_final_answer_check(final_answer, memory, agent=None):
    """smolagents final_answer_check: no final answer in the step that observed (it would be a guess)."""
    if _guard_refusal():
        raise ValueError(GUARD_MESSAGE)
    return True
'''
anchor = "\n# --- Incident memory ---"
assert anchor in s
s = s.replace(anchor, guard + anchor, 1)

# observation tools record the step; action tools check it
for fn in ["def get_pod_breakdown() -> str:", "def get_deployment_history() -> str:", "def get_kubernetes_logs() -> str:"]:
    i = s.index(fn); j = s.index('"""', s.index('"""', i) + 3) + 3
    s = s[:j] + "\n    _guard_observed()" + s[j:]
for fn in ["def scale_kubernetes_deployment(replicas: int) -> str:", "def restart_kubernetes_deployment() -> str:",
           "def restart_kubernetes_pod(pod_name: str) -> str:", "def rollback_kubernetes_deployment(revision: int = 0) -> str:"]:
    i = s.index(fn); j = s.index('"""', s.index('"""', i) + 3) + 3
    s = s[:j] + "\n    refusal = _guard_refusal()\n    if refusal:\n        return refusal" + s[j:]
open(p, "w").write(s)

p = os.path.join(d, "agent.py")
s = open(p).read()
s = s.replace("    rollback_kubernetes_deployment,\n)", "    rollback_kubernetes_deployment,\n    guard_start,\n    guard_stop,\n    guard_step_done,\n    guard_final_answer_check,\n)", 1)
old = """        add_base_tools=False,
        max_steps=10,  # investigation (1-3 calls) + action + final_answer, with room for one refused call
    )"""
assert old in s
s = s.replace(old, """        add_base_tools=False,
        max_steps=10,  # investigation (1-3 calls) + action + final_answer, with room for one refused call
        # Evidence-before-action guard: no-ops unless AIOPS_ACT_GUARD=on (agent_tools.ACT_GUARD).
        step_callbacks=[guard_step_done],
        final_answer_checks=[guard_final_answer_check],
    )""", 1)
old = """    try:
        response = str(sre_agent.run(prompt))
    except Exception as e:"""
assert old in s
s = s.replace(old, """    guard_start()
    try:
        response = str(sre_agent.run(prompt))
    except Exception as e:""", 1)
old = """    agent_seconds = time.monotonic() - started
"""
s = s.replace(old, """    guard_stop()
    agent_seconds = time.monotonic() - started
""", 1)
open(p, "w").write(s)
print("patched", d)
