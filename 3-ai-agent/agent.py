import os
import re
import csv
import json
import time
from datetime import datetime
import litellm
from smolagents import CodeAgent, LiteLLMModel
import health_model
import nfr_metrics
from agent_tools import (
    _health_bundle,
    query_knowledge_base,
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
        self.stats = {"calls": 0, "retries": 0, "fallback_calls": 0}

    def generate(self, *args, **kwargs):
        model_ids = [self.primary_model_id] + ([FALLBACK_MODEL] if FALLBACK_MODEL else [])
        last_error = None
        for model_id in model_ids:
            if model_id != self.primary_model_id:
                print(f"⚠️ [LLM] {self.primary_model_id} still failing, switching to fallback {model_id}")
            for attempt, delay in enumerate([0] + RETRY_DELAYS_SECONDS):
                if delay:
                    self.stats["retries"] += 1
                    print(f"⚠️ [LLM] {type(last_error).__name__} from {model_id}, retry {attempt}/{len(RETRY_DELAYS_SECONDS)} in {delay}s")
                    time.sleep(delay)
                self.stats["calls"] += 1
                if model_id != self.primary_model_id:
                    self.stats["fallback_calls"] += 1
                self.model_id = model_id  # read by LiteLLMModel.generate
                try:
                    message = super().generate(*args, **kwargs)
                    if _is_empty(message):
                        raise EmptyModelResponse(f"empty response from {model_id}")
                    return message
                except TRANSIENT_ERRORS as e:
                    last_error = e
                finally:
                    self.model_id = self.primary_model_id
        raise last_error


model = RetryingLiteLLMModel(model_id=PRIMARY_MODEL)

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


def _capacity_context():
    if not CAPACITY:
        return "(Capacity data unavailable: re-run 5-ml-training/capacity_discovery.py.)"
    lines = []
    for n, v in sorted(CAPACITY.items()):
        limit = v.get("slo_limit_rps")
        lines.append(f"  - {n} pod(s): serves up to ~{v['max_safe_rps']:g} rps with p95 <= ~{v.get('p95_at_safe', 0.25)} s"
                     + (f"; the {nfr_metrics.NFR_P95:g} s objective breaks at ~{limit:g} rps" if limit else ""))
    return "\n".join(lines)


CAPACITY_CONTEXT = _capacity_context()

# The agent: v12 (2026-11-01; design_decisions.md A31). As v11 (A30: inputs in NFR units with no tuned weights, the
# explanation of a score against the model's own bands and the safe level), with a model retrained with the 1-pod low
# end and tested with range probes (no hole in any band), the minimum pod count below every band = the smallest, and
# the verification judging the trajectory from 10 s after the rollout. As v10 (A28: the score reads as a distance from
# healthy, and the minimum pod count in the facts is the smallest count the model calls healthy for the load) and v9
# (A24) otherwise: one One-Class SVM on the NFR metrics measured at the ingress wakes it; it scales or restarts the
# whole app; code verifies the result by the model's score. v11: git tag v11-campaign; v10: v10-campaign; v9:
# v9-campaign; v8.1 and earlier: v8.1-campaign.
AGENT_VERSION = "v12"

# The LLM decides and acts; code does everything around it (memory lookup before
# the run, verification and memory save after it). add_base_tools=False: the
# default extras (web search, page visits, ...) have no place in an SRE agent.
# The guards (agent_tools) are wired through smolagents' hooks: a step callback counts the LLM's
# steps, and the final-answer checks refuse a guessed answer or a claimed action no tool executed.
sre_agent = CodeAgent(
    tools=[
        get_pod_breakdown,
        get_deployment_history,
        get_kubernetes_logs,
        scale_kubernetes_deployment,
        restart_kubernetes_deployment,
    ],
    model=model,
    add_base_tools=False,
    max_steps=10,  # investigation (3 calls) + action + final_answer, with room for refused calls
    step_callbacks=[guard_step_done],
    final_answer_checks=[guard_final_answer_check, claim_final_answer_check],
)

# Phase 2 has its own incident log (the NFR columns); phase 1's is incident_log_phase1.csv.
INCIDENT_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "incident_log.csv")
INCIDENT_LOG_FIELDS = [
    "woke_at", "agent_version", "signature", "throughput", "rps_per_pod", "latency_p95", "error_rate", "replicas",
    "ready_replicas", "avg_cpu_per_pod", "score", "explanation", "memory_hit", "actions", "verification",
    "verification_detail", "recovery_s", "score_after", "rewake", "saved_to_memory", "agent_error", "llm_calls",
    "llm_retries", "llm_fallback_calls", "agent_seconds", "total_seconds", "final_answer",
]


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
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): {what} -> verification {verdict}")
        elif r["error"]:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action (agent error: {r['error'][:80]})")
        else:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action ({(r['answer'] or '')[:120]})")
    return "\n".join(lines)


# The minimum pod count of the facts (v10, A28): the smallest count the health model calls healthy for the load, and
# for the load a rising trend reaches in REACTION_MINUTES, the time until new pods serve (detection, the agent, a new
# pod; added 2026-10-23 after a smoke run in which a ramp at 96% of capacity was called a transient). The headroom is
# in the model itself: its healthy data stop at the safe level, 0.25 s against the 0.35 s objective. A falling load is
# not anticipated (scale-downs stay conservative). v9 used 15% headroom over the capacity table instead. When no count
# is healthy, the facts say whether the load is below every band (the smallest count) or above (the largest; A31).
REACTION_MINUTES = 1.5


def _minimum_pods(rps, trend):
    projected = rps + max(0.0, trend or 0.0) * REACTION_MINUTES
    need, covered = health_model.min_healthy_pods(_health_bundle(), max(rps, projected))
    return need, projected, covered


def _computed_facts(metrics):
    """Arithmetic and model output the LLM should not redo itself, as plain facts: the health score and which
    metrics are outside their healthy range (health_model.explain), the load and its trend, the minimum pod count the
    health model calls healthy for it (and for the load the trend reaches by the time new pods serve), and where the
    load sits in the healthy band of the current pod count. No rule says what to do: the prompt uses them to tell a
    capacity mismatch from something else."""
    rps = float(metrics.get("throughput") or 0.0)
    reps = int(round(float(metrics.get("replicas") or 0)))
    ready = metrics.get("ready_replicas")
    trend = metrics.get("load_trend_rps_per_min")
    lines = []
    if metrics.get("score") is not None:
        why = metrics.get("explanation") or []
        lines.append(f"- Health score {float(metrics['score']):+.2f} (0 to 1 = healthy, 1 = typical; below 0 = anomalous, "
                     "the value is the distance from the nearest healthy state)." + (" Outside the healthy range: "
                                                                                    + "; ".join(why) if why else ""))
    if ready is not None and int(round(ready)) < reps:
        lines.append(f"- Only {int(round(ready))} of {reps} pod(s) are ready (the readiness probe of the others fails).")
    try:
        bands = _health_bundle()["bands"]
    except Exception:
        return "\n".join(lines + ["- Health model unavailable: no minimum pod count."])
    if trend is None:
        trend_text = "unknown (too few readings)"
    elif abs(trend) < 0.05 * max(rps, 1.0):
        trend_text = f"steady ({trend:+.1f} rps per minute)"
    else:
        trend_text = f"{'RISING' if trend > 0 else 'falling'} {trend:+.1f} rps per minute"
    need, projected, covered = _minimum_pods(rps, trend)
    lines.append(f"- Load: {rps:.1f} rps on {reps} pod(s) ({rps / max(reps, 1):.1f} per pod); trend over the last "
                 f"minute: {trend_text}.")
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
        where = ("ABOVE it (under-provisioned)" if rps > hi else
                 "BELOW it (over-provisioned)" if rps < lo else
                 "inside it, so the load alone does not explain bad latency or errors")
        lines.append(f"- The health model's healthy load band for {reps} pod(s) is {lo:g}-{hi:g} rps: the load is {where}.")
    return "\n".join(lines)


# The prompt v9 (2026-10-22), as used by v10 (2026-10-26: the objectives from nfr_metrics, the minimum pod count from
# the health model). Same structure as v8: Step 1 classifies capacity (scale to the minimum that fits, no
# investigation) or something else (investigate with all three observation tools, then act on the cause, restart only
# with evidence); the objectives are the NFRs, the actions scale and restart.
AGENT_PROMPT = """
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent responsible for the backend deployment. The health monitor (a One-Class SVM trained on healthy traffic) flagged the current state as abnormal.
This IS your active task.

Current reading (whole deployment, measured at the ingress as users see it, 1-minute windows): {metrics_json}
Assigned Signature: "{signature}"

=== SERVICE OBJECTIVES (non-functional requirements) ===
- Latency: p95 < {nfr_p95:g} s, as users see it.
- Errors: fewer than {nfr_errors_pct:g}% of requests fail (5xx).
- Cost: at most {max_pods} pods (the ceiling of this cluster), and no more pods than the load needs.

=== SYSTEM CAPACITY REFERENCE ===
Measured by load testing with the normal request mix: the load each pod count serves within the objectives.
{capacity}

=== COMPUTED FACTS (by the monitoring code from the reading above; use them, do not recompute) ===
{facts}

=== YOUR RECENT ACTIONS (last 15 minutes; verdicts from the automatic verification) ===
{recent}

=== INCIDENT MEMORY (retrieved automatically from past verified incidents) ===
{memory}

=== CRITICAL RULES FOR CODE AGENTS ===
1. You MUST output executable Python code wrapped in ```python ... ``` blocks.
2. DO NOT write conversational text outside the python blocks.
3. YOU MUST ONLY EXECUTE ONE TOOL PER TURN. Call one tool, print its result, and STOP to wait for the system output.
4. Never decide in the same step in which you observe: the system refuses an action or a final answer written in the same step as an observation tool.
5. Only a tool call changes the cluster. If you did not execute an action tool, your final answer must start with "No action taken:".

=== YOUR TASK ===
First decide which kind of problem this is, then act on it.

Step 1 - CLASSIFY, using the computed facts.
  (A) CAPACITY: the minimum pod count in the facts differs from the current count (it is the smallest count the health model calls healthy for this load and the load the trend is rising to), and the pods are ready. Go to Step 2A; no investigation is needed.
  (B) SOMETHING ELSE: the minimum pod count equals the current count but latency or errors are bad, or pods are not ready, OR you are not sure. Go to Step 2B.

Step 2A - CAPACITY:
  - The minimum is HIGHER than now (the load, or the load it is rising to, is more than the current pods serve healthily): scale UP with `scale_kubernetes_deployment(replicas=N)` to that minimum.
  - The minimum is LOWER than now and the objectives are met: you MUST scale DOWN to save resources, to that minimum.

Step 2B - INVESTIGATE, then act on the cause. Look at ALL THREE observation tools, one per step (the system refuses a restart until you have):
  - `get_pod_breakdown()`: per pod: CPU, throttling, request rate, CPU cost per request, p95, 5xx rate, event-loop lag, memory, restarts, age, revision, ready or not.
  - `get_deployment_history()`: recent revisions of the deployment and what changed in each.
  - `get_kubernetes_logs()`: warnings, errors and 5xx lines of every pod.
  Then choose the action that addresses the cause:
  - EVIDENCE of a bad state in the running processes: ERROR lines or a stuck / runaway job in the logs, pods that are not ready, or event-loop lag or CPU per request several times the healthy reference: `restart_kubernetes_deployment()` (rolling restart of the whole app; it keeps serving while the pods are replaced). Warnings that only repeat the symptom (e.g. "High latency detected") are not evidence of a cause.
  - It is capacity after all: scale as in Step 2A.
  - A recent change to the deployment caused it (deployment history): you have no tool to undo a change, and a restart would recreate it. Answer "No action taken: <the change>, needs a human decision".
  - No evidence of a cause and the breach is small or short (e.g. right after a restart or a scale, while new pods warm up): it may be a transient. Answer "No action taken: <reason>"; the monitor wakes you again if it persists.
  More pods only help when the load is more than the current pods serve. A restart only helps when the bad state lives in the running processes. If one of your recent actions failed verification, do not repeat it without new evidence: the cause is probably something else.

Step 3 - EXECUTE exactly one remediation action, or none. The system then follows the health score: it waits while the state improves, and wakes you again at once if it gets worse or stops improving.

Step 4 - REPORT in a later step than the action: `final_answer("Root cause: <one sentence, with the evidence>. Action: <what you did and why>.")`, or `final_answer("No action taken: <reason>")`, WRAPPED IN A ```python ... ``` BLOCK.
  Do NOT verify or save anything yourself: the system verifies the result and stores the incident in memory automatically after you finish.
"""


def trigger_ai_agent(metrics_json):
    """
    Called from anomaly_detector.py when an anomaly is confirmed. Returns {"resolved", "rewake", "verdict"}:
    rewake asks the detector to wake the agent again at once (the verification saw the state get worse or stop
    improving), except after a failed scale-down, which code has already undone.
    """
    started = time.monotonic()
    woke_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    strict_signature = generate_deterministic_signature(metrics_json)
    metrics = json.loads(metrics_json)
    # AIOPS_MEMORY=off: ablation for the RAG research question (no lookup, nothing saved).
    memory_on = os.getenv("AIOPS_MEMORY", "on").lower() != "off"
    memory = query_knowledge_base(metrics) if memory_on else "Incident memory disabled for this run."
    prompt = AGENT_PROMPT.format(metrics_json=metrics_json, signature=strict_signature, capacity=CAPACITY_CONTEXT,
                                 facts=_computed_facts(metrics), recent=_recent_actions_text(), memory=memory,
                                 nfr_p95=nfr_metrics.NFR_P95, nfr_errors_pct=100 * nfr_metrics.NFR_ERRORS,
                                 max_pods=nfr_metrics.MAX_PODS)

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
    verdict, detail, saved, rewake = "", "", "", False
    if not actions:
        resolved = not agent_error
        print(f"\n [AIOps Agent] No action applied to the cluster.\nAgent Final Output: {response}")
    else:
        print(f"\n [AIOps Agent] Actions {actions} applied. Verifying...")
        print(verify_metrics_stabilization(metrics_json))
        # Kept here: a rollback goes through the scale tool, which resets run_outcome.
        verdict, detail = run_outcome["verification"] or "", run_outcome["detail"]
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
        "memory_hit": "verified past incident(s)" in memory and not memory.startswith("NO similar"),
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
        "agent_seconds": round(agent_seconds, 1),
        "total_seconds": round(time.monotonic() - started, 1),
        "final_answer": response[:500],
    })
    return {"resolved": resolved, "rewake": rewake, "verdict": detail.split("\n", 1)[0] if detail else verdict}
