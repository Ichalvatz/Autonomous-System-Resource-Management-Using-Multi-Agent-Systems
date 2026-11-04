import ast
import os
import re
import csv
import json
import time
import importlib.resources
from datetime import datetime
import litellm
import yaml
from smolagents import CodeAgent, LiteLLMModel
import health_model
import nfr_metrics
from agent_tools import (
    _health_bundle,
    query_knowledge_base,
    MEMORY_HIT,
    get_kubernetes_logs,
    scale_kubernetes_deployment,
    save_incident,
    verify_metrics_stabilization,
    restart_kubernetes_deployment,
    run_outcome,
    reset_run_outcome,
    get_pod_breakdown,
    get_deployment_history,
    guard_start,
    guard_stop,
    guard_step_done,
    guard_final_answer_check,
    claim_final_answer_check,
)

# API key from Google AI Studio (the root .env is not auto-loaded).
if not os.getenv("GEMINI_API_KEY"):
    raise SystemExit("GEMINI_API_KEY is not set: export it before running the live detector.")

PRIMARY_MODEL = "gemini/gemini-3.1-flash-lite"
# Second model, used only after the primary keeps failing (e.g. Gemini 503 "high demand", answers without
# text). Every call that used it is counted in incident_log.csv (llm_fallback_calls). Default since
# 2026-10-04 04:40 (after all measured runs, which had NO fallback): gemini-2.5-flash, same API key,
# checked to answer in ~0.6 s. AIOPS_FALLBACK_MODEL=<model> to change it, =off to disable it.
_fallback = os.getenv("AIOPS_FALLBACK_MODEL", "gemini/gemini-2.5-flash")
FALLBACK_MODEL = None if _fallback.lower() in ("", "off", "none") else _fallback

# Transient provider errors worth retrying. Anything else (bad request, auth) fails fast.
TRANSIENT_ERRORS = (
    litellm.exceptions.RateLimitError,
    litellm.exceptions.ServiceUnavailableError,
    litellm.exceptions.InternalServerError,
    litellm.exceptions.BadGatewayError,
    litellm.exceptions.APIConnectionError,
    litellm.exceptions.Timeout,
)
RETRY_DELAYS_SECONDS = [5, 15, 30]  # free tier limits are per minute
# Each call gets at most this long (v14, A33; proposed in A27). Without it litellm waits up to 6000 s: on 2026-11-03/04 the
# prompt evaluation saw single runs take 30-160 min on stalled calls, and on 2026-10-23 one stalled call lost a cpuhog run.
# Calls without a retry took a median 2.7 s (p90 11 s), so 60 s cuts only a stall; the cut call is retried like a 503.
CALL_TIMEOUT_SECONDS = 60


class EmptyModelResponse(Exception):
    """Gemini sometimes answers with no content at all. smolagents then logs
    "Error in code parsing: expected string ... got 'NoneType'" and spends a whole
    extra step (~11 s, seen in 2 of 4 incidents of one 2026-10-01 run). Retrying
    the call is cheaper and keeps the agent's transcript clean."""


TRANSIENT_ERRORS = TRANSIENT_ERRORS + (EmptyModelResponse,)


def _is_empty(message):
    # No text = empty, even if the message carries native tool_calls: a CodeAgent only parses the
    # text (code blocks), so such a message costs a whole wasted step ("expected string or bytes-like
    # object, got 'NoneType'"). Seen 2026-10-03: 5 such steps in a row lost one incident. (Until
    # then a message with tool_calls was exempt from this check.)
    content = getattr(message, "content", None)
    if content is None:
        return True
    if isinstance(content, str):
        return not content.strip()
    return not content  # list-of-parts form


def _fence_bare_code(message):
    """A reply whose code has no fence gets one; returns whether it did.

    smolagents accepts bare code (parse_code_blobs: "Maybe the LLM outputted a code blob directly"), but CodeAgent first
    appends the closing fence to any reply that lacks it, so the bare code no longer parses and the step fails. With the
    first draft of the v14 prompt (reasoning as comments inside the block) 17 of 44 capacity runs of the prompt
    evaluation lost a step to a format failure; the one traced was such a reply, and with the final prompt one reply
    had the "Thoughts:" line and then the code, again without the fence (A33).
    Touched only: a reply with no fence and no <code> whose code starts at a line that begins with a comment, print(,
    final_answer( or a tool call, with nothing before it or only the "Thoughts:" text, and that parses as Python and
    calls something. The text is kept; only the fence is added. A one-word reply such as "ok" is valid Python, but it
    is not code."""
    text = getattr(message, "content", None)
    if not isinstance(text, str) or "```" in text or "<code>" in text:
        return False
    starts = tuple(f"{t.name}(" for t in SRE_TOOLS) + ("#", "print(", "final_answer(")
    lines = text.strip().split("\n")
    first = next((i for i, line in enumerate(lines) if line.lstrip().startswith(starts)), None)
    if first is None or (first and not lines[0].startswith("Thought")):
        return False
    code = "\n".join(lines[first:])
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return False
    if not any(isinstance(node, ast.Call) for node in ast.walk(tree)):
        return False
    message.content = "".join(line + "\n" for line in lines[:first]) + f"```python\n{code}\n```"
    return True


def _quota(error):
    """The quota a 429 hit (e.g. GenerateRequestsPerDayPerProjectPerModel-FreeTier), for the log; '' if none."""
    found = re.search(r'quotaId"?:\s*"([^"]+)"', str(error))
    return f" ({found.group(1)})" if found else ""


class RetryingLiteLLMModel(LiteLLMModel):
    """LiteLLMModel that retries transient errors with backoff, then tries the fallback model.

    Without it, one Gemini 503 in the middle of an incident crashed the whole
    agent run (seen live on 2026-09-30, right after a 2->3 scale).
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.primary_model_id = self.model_id
        self.stats = {}
        self.reset_stats()

    def reset_stats(self):
        self.stats = {"calls": 0, "retries": 0, "fallback_calls": 0, "fenced": 0}

    def generate(self, *args, **kwargs):
        model_ids = [self.primary_model_id] + ([FALLBACK_MODEL] if FALLBACK_MODEL else [])
        last_error = None
        for model_id in model_ids:
            if model_id != self.primary_model_id:
                print(f"⚠️ [LLM] {self.primary_model_id} still failing, switching to fallback {model_id}")
            for attempt, delay in enumerate([0] + RETRY_DELAYS_SECONDS):
                if delay:
                    self.stats["retries"] += 1
                    print(f"⚠️ [LLM] {type(last_error).__name__}{_quota(last_error)} from {model_id}, "
                          f"retry {attempt}/{len(RETRY_DELAYS_SECONDS)} in {delay}s")
                    time.sleep(delay)
                self.stats["calls"] += 1
                if model_id != self.primary_model_id:
                    self.stats["fallback_calls"] += 1
                self.model_id = model_id  # read by LiteLLMModel.generate
                try:
                    message = super().generate(*args, **kwargs)
                    if _is_empty(message):
                        raise EmptyModelResponse(f"empty response from {model_id}")
                    self.stats["fenced"] += _fence_bare_code(message)
                    return message
                except TRANSIENT_ERRORS as e:
                    last_error = e
                finally:
                    self.model_id = self.primary_model_id
        raise last_error


# retry=False: smolagents' own retry of 429s (waits 60 s, then 120 s, uncounted) is off, so the wrapper above is the one
# retry policy, with its waits printed and counted (until v13 a 429 could cost ~3 min per attempt, unseen).
model = RetryingLiteLLMModel(model_id=PRIMARY_MODEL, timeout=CALL_TIMEOUT_SECONDS, retry=False)

# ---------------------------------------------------------------------------
# The capacity table (5-ml-training/capacity_discovery.py, phase 2): per pod count, the load of the normal
# request mix it serves within the objectives. REFERENCE DATA for the agent's reasoning, not logic.
# ---------------------------------------------------------------------------
_CAPACITY_TABLE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "5-ml-training", "capacity_table.json"
)


def _load_capacity():
    try:
        with open(_CAPACITY_TABLE_PATH) as f:
            return {int(k): v for k, v in json.load(f).items() if v.get("max_safe_rps")}
    except Exception:
        return {}


CAPACITY = {n: v for n, v in _load_capacity().items() if n <= nfr_metrics.MAX_PODS}   # 4 pods only re-checked the ceiling


def _capacity_table():
    """What each pod count serves, for the system prompt (v14, A33): the health model's healthy load band (it decides
    the minimum pod count of the facts) next to the load at which load testing saw the p95 objective break. Until v13
    the prompt listed the capacity table's safe rates (95 / 165 / 255 rps) while the facts used the model's bands
    (87.3 / 162.1 / 251.3): two numbers for one thing."""
    try:
        bands = _health_bundle()["bands"]
    except Exception:
        return "(Health model unavailable: no healthy load bands.)"
    rows = ["| Pods | Healthy load band (health model) | p95 objective breaks at (measured) |", "|---|---|---|"]
    for n, (lo, hi) in sorted(bands.items()):
        limit = (CAPACITY.get(n) or {}).get("slo_limit_rps")
        rows.append(f"| {n} | {lo:g}-{hi:g} rps | {f'~{limit:g} rps' if limit else 'not measured'} |")
    return "\n".join(rows)

# The agent: v14 (2026-11-03; design_decisions.md A33): v13 with the prompt rewritten. The stable instructions (role,
# objectives, what each pod count serves, how to decide, how to work, the tools) are our own system prompt in place of
# smolagents' generic one; each wake-up sends only the incident (the reading with its window, the computed facts, the
# recent actions, the memory) and ends with the task. One code format (```python, code_block_tags="markdown"): until v13
# smolagents asked for <code> while the prompt asked for ```python, and 15 of 581 phase-2 steps failed on a stray
# "python" line. The decision procedure is v9's. v13's prompt: 4-load-testing/archive/prompt_v13/.
# v13 (2026-11-02; A32, A32.1): v12 with the detector judging every reading after a
# pod-count change (v12 skipped 90 s; a change no verification watched is followed with the verification's rule), and
# after a change both the verification and the detector read only data from after it (the window starts where the change
# took effect and grows to the usual minute), with the noise of each comparison measured; the verification's fixed
# times ("worse" from 10 s, "not improving" from 60 s) are gone. Live-checked 2026-11-03 (git tag v13-live-check).
# v12 (2026-11-01; A31): as v11 (A30: inputs in NFR units with no tuned weights, the
# explanation of a score against the model's own bands and the safe level), with a model retrained with the 1-pod low
# end and tested with range probes (no hole in any band), the minimum pod count below every band = the smallest, and
# the verification judging the trajectory from 10 s after the rollout. As v10 (A28: the score reads as a distance from
# healthy, and the minimum pod count in the facts is the smallest count the model calls healthy for the load) and v9
# (A24) otherwise: one One-Class SVM on the NFR metrics measured at the ingress wakes it; it scales or restarts the
# whole app; code verifies the result by the model's score. v12: git tag v12-campaign; v11: v11-campaign; v10:
# v10-campaign; v9: v9-campaign; v8.1 and earlier: v8.1-campaign.
AGENT_VERSION = "v14"

# The system prompt (v14, A33): what stays the same at every wake-up. The decision procedure is v9's (classify by the
# minimum pod count; capacity -> scale to it; anything else -> all three observation tools, then act on the cause), in
# a calm, direct register with the reason for each rule, as Google's Gemini 3 prompting guide advises. The tools'
# descriptions come from their docstrings (smolagents renders them in the Jinja block at the end).
SYSTEM_PROMPT = f"""You are the SRE agent of one Kubernetes deployment, the backend of the web application "myWorld Travel". A health monitor watches the service and wakes you when it leaves its healthy state. Your job is to find what kind of problem it is and act on it with your tools. Code around you checks every action afterwards and keeps a memory of past incidents, so you only decide and act.

## Service objectives (the non-functional requirements)
- Latency: p95 below {nfr_metrics.NFR_P95:g} s, measured at the ingress, as users see it.
- Errors: fewer than {100 * nfr_metrics.NFR_ERRORS:g}% of requests fail (5xx).
- Cost: at most {nfr_metrics.MAX_PODS} pods, and no more pods than the load needs.

## What each pod count serves
The health model (a One-Class SVM trained on healthy traffic) calls each pod count healthy within a band of load. Load testing measured where the latency objective breaks.

{_capacity_table()}

The bands overlap on purpose, so the new count is healthy right after a scale-up or a scale-down.

## How to decide
1. Classify the incident with the computed facts you are given.
   - Capacity: the minimum pod count in the facts differs from the current count, and all pods are ready. The minimum is the smallest count the health model calls healthy for this load and for the load a rising trend reaches before new pods serve. Go to 2A; no investigation is needed.
   - Something else: the minimum equals the current count but latency or errors are bad, or some pods are not ready, or you are not sure. Go to 2B.
2A. Capacity: scale to the minimum with scale_kubernetes_deployment(replicas=N). Scale up when the minimum is higher than now. Scale down when it is lower and the objectives are met, because pods the load does not need break the cost objective.
2B. Something else: investigate with all three observation tools, get_pod_breakdown(), get_deployment_history() and get_kubernetes_logs(), one per step (the system refuses a restart until you have used all three), then act on the cause.
   - Evidence of a bad state inside the running processes calls for restart_kubernetes_deployment(): ERROR lines or a stuck or runaway job in the logs, pods that are not ready, or event-loop lag or CPU per request several times the healthy reference. Warnings that only repeat the symptom (such as "High latency detected") are not evidence of a cause.
   - If it turns out to be capacity, scale as in 2A.
   - If a recent change to the deployment caused it (deployment history), take no action: you have no tool to undo a change, and a restart would recreate it. Answer "No action taken: <the change>, needs a human decision".
   - If there is no evidence of a cause and the breach is small or short (for example right after a restart or a scale, while new pods warm up), it may be transient. Answer "No action taken: <reason>"; the monitor wakes you again if it persists.
   Keep in mind: more pods help only when the load is more than the current pods serve; a restart helps only when the bad state lives in the running processes; if one of your recent actions failed verification, do not repeat it without new evidence, because the cause is probably something else.
3. Apply at most one remediation action. The system then follows the health score: it waits while the state improves, and wakes you again at once if it gets worse or stops improving.
4. Report in a later step than the action: final_answer("Root cause: <one sentence, with the evidence>. Action: <what you did and why>.") or final_answer("No action taken: <reason>"). Do not verify or save anything yourself: the system does both after you finish.

## How you work
Each reply is one step: a line that starts with "Thoughts:" and says what you do and why, then one Python code block that calls one tool. For example:
Thoughts: The minimum pod count equals the current one, so this is not capacity; I look at the pods first.
```python
print(get_pod_breakdown())
```
- Call one tool per step and print its result. You see the output in the next step, as "Observation".
- Decide only after you have read what you observed: the system refuses an action or a final answer written in the same step as an observation tool.
- Only a tool call changes the cluster. If you did not call scale_kubernetes_deployment or restart_kubernetes_deployment, your final answer must start with "No action taken:".
- Pass tool arguments by name, e.g. scale_kubernetes_deployment(replicas=3). You need no imports; variables persist between steps.
- Finish with final_answer(...) in a step of its own.

Your tools:
""" + """```python
{%- for tool in tools.values() %}
{{ tool.to_code_prompt() }}
{% endfor %}
```"""

# smolagents' own templates, with our system prompt. Its planning templates stay unused (no planning_interval); its
# final_answer template is used only if the agent runs out of steps.
PROMPT_TEMPLATES = yaml.safe_load(
    importlib.resources.files("smolagents.prompts").joinpath("code_agent.yaml").read_text())
PROMPT_TEMPLATES["system_prompt"] = SYSTEM_PROMPT

# The LLM decides and acts; code does everything around it (memory lookup before
# the run, verification and memory save after it). add_base_tools=False: the
# default extras (web search, page visits, ...) have no place in an SRE agent.
# The guards (agent_tools) are wired through smolagents' hooks: a step callback counts the LLM's
# steps, and the final-answer checks refuse a guessed answer or a claimed action no tool executed.
SRE_TOOLS = [
    get_pod_breakdown,
    get_deployment_history,
    get_kubernetes_logs,
    scale_kubernetes_deployment,
    restart_kubernetes_deployment,
]


def make_sre_agent(llm, tools=SRE_TOOLS):
    """The CodeAgent of every run (prompt_eval.py builds the same one around recorded tool outputs)."""
    return CodeAgent(
        tools=list(tools),
        model=llm,
        prompt_templates=PROMPT_TEMPLATES,
        code_block_tags="markdown",
        add_base_tools=False,
        max_steps=10,  # investigation (3 calls) + action + final_answer, with room for refused calls
        step_callbacks=[guard_step_done],
        final_answer_checks=[guard_final_answer_check, claim_final_answer_check],
    )


sre_agent = make_sre_agent(model)

# Phase 2 has its own incident log (the NFR columns); phase 1's is incident_log_phase1.csv.
INCIDENT_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "incident_log.csv")
INCIDENT_LOG_FIELDS = [
    "woke_at", "agent_version", "signature", "throughput", "rps_per_pod", "latency_p95", "error_rate", "replicas",
    "ready_replicas", "avg_cpu_per_pod", "score", "explanation", "memory_hit", "actions", "verification",
    "verification_detail", "recovery_s", "score_after", "rewake", "saved_to_memory", "agent_error", "llm_calls",
    "llm_retries", "llm_fallback_calls", "llm_fenced", "agent_seconds", "total_seconds", "final_answer",
]  # llm_fenced (v14, A33): replies that were bare code and got their fence (agent._fence_bare_code); empty before v14


def _rollback_failed_scale_down(actions):
    """If the last action was a scale-down that failed verification, restore the previous count.

    Scale-downs are the risky, optional actions (waste costs money, too few pods costs
    users), so they are undone automatically. A failed scale-up is left in place: rolling
    it back would make things worse, and the detector will wake the agent again.
    """
    match = re.fullmatch(r"scale (\d+)->(\d+)", actions[-1]) if actions else None
    if not match or int(match.group(2)) >= int(match.group(1)):
        return None
    previous = int(match.group(1))
    print(f"↩️ [Rollback] scale-down not verified: restoring {previous} replicas")
    result = scale_kubernetes_deployment(replicas=previous)
    print(f"↩️ [Rollback] {result}")
    return f"rollback to {previous}" if result.startswith("✅") else f"rollback to {previous} FAILED"


def _log_incident(row):
    """Append one agent run to incident_log.csv (thesis evidence: MTTR, success rate)."""
    new_file = not os.path.exists(INCIDENT_LOG_PATH)
    with open(INCIDENT_LOG_PATH, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=INCIDENT_LOG_FIELDS)
        if new_file:
            writer.writeheader()
        writer.writerow(row)


# A short label of the state for incident_log.csv and campaign_report.py (in the prompt until v13).
def generate_deterministic_signature(metrics_json):
    m = json.loads(metrics_json)
    return (f"State -> Pods:{int(round(m.get('replicas', 0)))} | Load:{round(m.get('throughput', 0))}rps "
            f"({m.get('rps_per_pod', 0):.0f}/pod) | P95:{m.get('latency_p95', 0):.2f}s | "
            f"Errors:{100 * (m.get('error_rate') or 0):.1f}%")


# Short-term memory of this detector process (YOUR RECENT ACTIONS in the prompt): what the agent did in the last
# minutes and how verification judged it. On 2026-10-01 the agent repeated the same failed 3->1 three times in six
# minutes: each wake-up had no trace of the previous failure. Kept in-process on purpose: it expires by itself
# and cannot teach a stale lesson to a later, different incident (ChromaDB keeps failures only for the record).
RECENT_ACTIONS = []
RECENT_WINDOW_SECONDS = 15 * 60


def _remember_run(woke_at, actions, verdict, detail, agent_error, response):
    RECENT_ACTIONS.append({"t": time.time(), "woke_at": woke_at, "actions": list(actions), "verdict": verdict,
                           "detail": detail, "error": agent_error, "answer": response})


def _recent_actions_text(now=None):
    now = now or time.time()
    recent = [r for r in RECENT_ACTIONS if now - r["t"] <= RECENT_WINDOW_SECONDS]
    if not recent:
        return "None in the last 15 minutes."
    lines = []
    for r in recent:
        ago = int((now - r["t"]) // 60)
        if r["actions"]:
            what = "; ".join(r["actions"])
            verdict = (r.get("detail") or "").split("\n", 1)[0] or r["verdict"] or "not verified"
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): {what}; verification: {verdict}.")
        elif r["error"]:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action (agent error: {r['error'][:80]}).")
        else:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action ({(r['answer'] or '')[:120]}).")
    return "\n".join(lines)


# The minimum pod count of the facts (v10, A28): the smallest count the health model calls healthy for the load, and
# for the load a rising trend reaches in REACTION_MINUTES (added 2026-10-23 after a smoke run in which a ramp at 96% of
# capacity was called a transient). REACTION_MINUTES spans what lies between the reading and new pods serving: the 1 m
# throughput lags a ramp by ~30 s, the agent takes a median ~11 s (up to ~70 s when the provider is slow), a new pod a
# few seconds: ~0.7-1.8 min in all (2026-11-03: in 113 wake-ups since v10 the trend changed the minimum 3 times, all
# right, and 1 min would give the same three). The headroom is in the model itself: its healthy data stop at the safe
# level, 0.25 s against the 0.35 s objective. A falling load is not anticipated (scale-downs stay conservative). v9 used
# 15% headroom over the capacity table instead. When no count is healthy, the facts say whether the load is below
# every band (the smallest count) or above (the largest; A31).
REACTION_MINUTES = 1.5


def _minimum_pods(rps, trend):
    projected = rps + max(0.0, trend or 0.0) * REACTION_MINUTES
    need, covered = health_model.min_healthy_pods(_health_bundle(), max(rps, projected))
    return need, projected, covered


def _trend_text(rps, trend):
    if trend is None:
        return "unknown (too few readings yet)"
    if abs(trend) < 0.05 * max(rps, 1.0):
        return f"steady ({trend:+.1f} rps per minute)"
    return f"{'rising' if trend > 0 else 'falling'}, {trend:+.1f} rps per minute"


def _window_text(window):
    """The span of the reading: the usual minute, or (A32.1) the seconds since the last change took effect."""
    if not window or window == nfr_metrics.WINDOW:
        return "over the last minute"
    return (f"over the {window.rstrip('s')} s since the last change to the pods took effect; a full minute is not "
            "available yet")


def _reading_section(metrics):
    """The reading in physical units, with its window (v14, A33; until v13 the raw JSON of the detector)."""
    rps = float(metrics.get("throughput") or 0.0)
    reps = int(round(float(metrics.get("replicas") or 0)))
    ready = metrics.get("ready_replicas")
    cpu = metrics.get("avg_cpu_per_pod")
    return "\n".join([
        f"### Reading (whole deployment, at the ingress, {_window_text(metrics.get('window'))})",
        f"- Load: {rps:.1f} rps on {reps} pod(s) ({rps / max(reps, 1):.1f} per pod); trend over the last minute: "
        f"{_trend_text(rps, metrics.get('load_trend_rps_per_min'))}.",
        f"- p95 latency: {float(metrics.get('latency_p95') or 0.0):.2f} s. "
        f"Errors: {100 * float(metrics.get('error_rate') or 0.0):.1f}%.",
        f"- Pods ready: {'unknown' if ready is None else int(round(ready))} of {reps}."
        + (f" CPU: {float(cpu):.2f} cores per pod." if cpu is not None else ""),
    ])


def _computed_facts(metrics):
    """Arithmetic and model output the LLM should not redo itself, as plain facts: the health score and which
    metrics are outside their healthy range (health_model.explain), the minimum pod count the health model calls
    healthy for the load (and for the load the trend reaches by the time new pods serve), and where the load sits in
    the healthy band of the current pod count. No rule says what to do: the system prompt uses them to tell a capacity
    mismatch from something else."""
    rps = float(metrics.get("throughput") or 0.0)
    reps = int(round(float(metrics.get("replicas") or 0)))
    ready = metrics.get("ready_replicas")
    trend = metrics.get("load_trend_rps_per_min")
    lines = []
    if metrics.get("score") is not None:
        why = metrics.get("explanation") or []
        lines.append(f"- Health score {float(metrics['score']):+.2f} (0 to 1 = healthy, 1 = typical; below 0 = anomalous, "
                     "the value is the distance from the nearest healthy state)." + (" Outside the healthy range: "
                                                                                    + "; ".join(why) + "." if why else ""))
    if ready is not None and int(round(ready)) < reps:
        lines.append(f"- Only {int(round(ready))} of {reps} pod(s) are ready: the readiness probe of the others fails.")
    try:
        bands = _health_bundle()["bands"]
    except Exception:
        return "\n".join(lines + ["- Health model unavailable: no minimum pod count."])
    need, projected, covered = _minimum_pods(rps, trend)
    beyond = ("" if covered else
              " (the smallest count: the load is below every pod count's healthy band)" if need == min(bands) else
              " (the maximum allowed: no pod count is healthy for this load)")
    trend_note = (f", and for the {projected:.0f} rps the trend reaches in {REACTION_MINUTES * 60:.0f} s (the time "
                  "until new pods serve)") if projected > rps + 0.5 else ""
    lines.append(f"- Minimum pod count the health model calls healthy for this load{trend_note}: {need}{beyond}. "
                 f"Current: {reps}.")
    band = bands.get(reps)
    if band:
        lo, hi = band
        where = ("above it (under-provisioned)" if rps > hi else
                 "below it (over-provisioned)" if rps < lo else
                 "inside it, so the load alone does not explain bad latency or errors")
        lines.append(f"- The healthy load band for {reps} pod(s) is {lo:g}-{hi:g} rps: the load is {where}.")
    return "\n".join(lines)


def incident_message(metrics, memory, recent):
    """The task of one wake-up (v14, A33): the incident only, since the instructions are in the system prompt. Context
    first, then the task and its key constraints as the last line (Google's Gemini 3 prompting guide)."""
    return "\n".join([
        f"## Incident at {metrics.get('timestamp') or datetime.now().strftime('%H:%M:%S')}",
        "The health monitor flagged the current state of the service as anomalous.",
        "",
        _reading_section(metrics),
        "",
        "### Computed facts (from the health model and the reading; use them, do not recompute them)",
        _computed_facts(metrics),
        "",
        "### Your recent actions (last 15 minutes, with the verification's verdict)",
        recent,
        "",
        "### Incident memory (similar verified past incidents)",
        memory,
        "",
        "Classify this incident and act on it as your instructions say: one tool per step, decide only after you have "
        "read an observation, and at most one remediation action.",
    ])


def trigger_ai_agent(metrics_json):
    """
    Called from anomaly_detector.py when an anomaly is confirmed. Returns {"resolved", "rewake", "verdict",
    "changed_at"}: rewake asks the detector to wake the agent again at once (the verification saw the state get worse or
    stop improving), except after a failed scale-down, which code has already undone; changed_at is the time
    (time.monotonic, same process) the action's rollout converged, from which the detector's readings hold only
    post-change data until they are a minute long (A32.1); None without an action.
    """
    started = time.monotonic()
    woke_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    strict_signature = generate_deterministic_signature(metrics_json)
    metrics = json.loads(metrics_json)
    # AIOPS_MEMORY=off: ablation for the RAG research question (no lookup, nothing saved).
    memory_on = os.getenv("AIOPS_MEMORY", "on").lower() != "off"
    memory = query_knowledge_base(metrics) if memory_on else "Incident memory disabled for this run."
    prompt = incident_message(metrics, memory, _recent_actions_text())

    print(f"\n🤖 [AIOps Agent] Agent woke up ({AGENT_VERSION})! Assigned Signature: {strict_signature}")
    print(f"🧠 [Memory] {memory}\n")

    reset_run_outcome()
    model.reset_stats()
    response, agent_error = "", ""
    # AIOPS_ACT_GUARD=off disables the three guards (ablation); on by default.
    guard_start(enforce=os.getenv("AIOPS_ACT_GUARD", "on").lower() != "off")
    try:
        response = str(sre_agent.run(prompt))
    except Exception as e:
        # Actions already applied before the error are still verified below.
        agent_error = f"{type(e).__name__}: {e}"
        print(f"\n[AIOps Agent] Agent crashed during execution: {e}")
    guard_stop()
    agent_seconds = time.monotonic() - started

    # Judge success from what the tools recorded, not from the LLM's text.
    actions = list(run_outcome["actions"])
    verdict, detail, saved, rewake, changed_at = "", "", "", False, None
    if not actions:
        resolved = not agent_error
        print(f"\n [AIOps Agent] No action applied to the cluster.\nAgent Final Output: {response}")
    else:
        print(f"\n [AIOps Agent] Actions {actions} applied. Verifying...")
        print(verify_metrics_stabilization(metrics_json))
        # Kept here: a rollback goes through the scale tool, which resets run_outcome.
        verdict, detail = run_outcome["verification"] or "", run_outcome["detail"]
        changed_at = run_outcome.get("changed_at")
        recovery_s, score_after = run_outcome["recovery_s"], run_outcome["score_after"]
        resolved = verdict == "STABLE"
        diagnosis = response or f"(no LLM summary: {agent_error[:150]})"
        saved = (save_incident(metrics, actions, verdict, diagnosis, AGENT_VERSION)
                 if memory_on else "Not saved: memory disabled (AIOPS_MEMORY=off).")
        print(f"💾 [Memory] {saved}")
        if resolved:
            print(f"\n [AIOps Agent] Actions {actions} verified STABLE.\nSummary: {response}")
        else:
            print(f"\n [AIOps Agent] Actions {actions} not confirmed (verification: {verdict}).")
            print(f"Agent Final Output: {response}")
            rollback = _rollback_failed_scale_down(actions)
            if rollback:
                actions.append(rollback)
            rewake = verdict == "UNSTABLE" and not rollback
        run_outcome.update(recovery_s=recovery_s, score_after=score_after)

    _remember_run(woke_at, actions, verdict, detail, agent_error, response)
    _log_incident({
        "woke_at": woke_at,
        "agent_version": AGENT_VERSION,
        "signature": strict_signature,
        **{k: metrics.get(k) for k in ["throughput", "rps_per_pod", "latency_p95", "error_rate", "replicas",
                                       "ready_replicas", "avg_cpu_per_pod", "score"]},
        "explanation": "; ".join(metrics.get("explanation") or []),
        "memory_hit": bool(MEMORY_HIT.match(memory)),
        "actions": "; ".join(actions),
        "verification": verdict,
        "verification_detail": detail.split("\n", 1)[0][:200],
        "recovery_s": run_outcome["recovery_s"] if actions else "",
        "score_after": run_outcome["score_after"] if actions else "",
        "rewake": rewake,
        "saved_to_memory": saved.startswith("Success"),
        "agent_error": agent_error[:300],
        "llm_calls": model.stats["calls"],
        "llm_retries": model.stats["retries"],
        "llm_fallback_calls": model.stats["fallback_calls"],
        "llm_fenced": model.stats["fenced"],
        "agent_seconds": round(agent_seconds, 1),
        "total_seconds": round(time.monotonic() - started, 1),
        "final_answer": response[:500],
    })
    return {"resolved": resolved, "rewake": rewake, "verdict": detail.split("\n", 1)[0] if detail else verdict,
            "changed_at": changed_at}
