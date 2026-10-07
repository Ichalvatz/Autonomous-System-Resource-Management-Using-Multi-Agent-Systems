import os
import re
import csv
import json
import time
from datetime import datetime
import litellm
from smolagents import CodeAgent, LiteLLMModel
from agent_tools import (
    query_knowledge_base,
    get_kubernetes_logs,
    scale_kubernetes_deployment,
    save_resolution_to_chroma,
    verify_metrics_stabilization,
    restart_kubernetes_deployment,
    run_outcome,
    reset_run_outcome,
    get_pod_breakdown,
    get_deployment_history,
    restart_kubernetes_pod,
    rollback_kubernetes_deployment,
    HEALTHY_CPU_PER_REQUEST_MAX,
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
    # object, got 'NoneType'"). Seen 2026-10-03: 5 such steps in a row lost one v7 incident. (Until
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
# Load the capacity table once at startup and format it as human-readable
# context.  This is REFERENCE DATA for the agent's reasoning, not logic.
# ---------------------------------------------------------------------------
_CAPACITY_TABLE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "5-ml-training", "capacity_table.json"
)

def _load_capacity_context() -> str:
    """Read capacity_table.json and return a human-readable summary."""
    try:
        with open(_CAPACITY_TABLE_PATH, "r") as f:
            table = json.load(f)
    except Exception as e:
        return f"(Capacity data unavailable: {e})"

    lines = []
    for replicas_str in sorted(table.keys(), key=int):
        entry = table[replicas_str]
        # Older tables only stored VU counts, which are not comparable to the
        # live throughput metric (rps). Refuse them rather than mislead the agent.
        if "max_safe_rps" not in entry:
            return (
                "(Capacity data unavailable: capacity_table.json has no rps "
                "measurements. Re-run 5-ml-training/capacity_discovery.py.)"
            )
        max_safe = entry["max_safe_rps"]
        breaking = entry.get("breaking_rps")
        breaking_str = f"breaks at ~{breaking} rps" if breaking is not None else "no breaking point reached"
        reason = entry.get("breaking_reason", "")
        reason_str = f" [Breaking trigger: {reason}]" if reason else ""
        lines.append(
            f"  - {replicas_str} replica(s): safe up to ~{max_safe} rps, "
            f"{breaking_str}{reason_str}"
        )
    return "\n".join(lines)

CAPACITY_CONTEXT = _load_capacity_context()


def _load_safe_rps():
    """{replicas: max safe rps} from capacity_table.json (v7 computes the needed replica count)."""
    try:
        with open(_CAPACITY_TABLE_PATH) as f:
            return {int(k): float(v["max_safe_rps"]) for k, v in json.load(f).items()}
    except Exception:
        return {}


SAFE_RPS = _load_safe_rps()

# AIOPS_PROMPT selects the prompt AND the toolset. Default: v8, the final version (2026-10-04 00:45,
# after it passed every scenario at the first wake-up: demo x2, cpuhog, stuck, badconfig x2).
# v4 (default until 2026-10-03 20:20), v5, v6 and v7 (default 20:20-00:45) are kept exactly as
# measured, for reproducing the thesis results: AIOPS_PROMPT=v4|v5|v6|v7.
PROMPT_VERSION = os.getenv("AIOPS_PROMPT", "v8").lower()

# The LLM decides and acts; code does everything around it (memory lookup before
# the run, verification and memory save after it). add_base_tools=False: the
# default extras (web search, page visits, ...) have no place in an SRE agent.
if PROMPT_VERSION == "v6":
    sre_agent = CodeAgent(
        tools=[
            get_pod_breakdown,
            get_deployment_history,
            get_kubernetes_logs,
            scale_kubernetes_deployment,
            restart_kubernetes_deployment,
            restart_kubernetes_pod,
            rollback_kubernetes_deployment,
        ],
        model=model,
        add_base_tools=False,
        max_steps=10,  # investigation (1-3 calls) + action + final_answer, with room for one refused call
    )
elif PROMPT_VERSION in ("v7", "v8"):
    # v7 = the final version: v6's tools + two code-enforced guards (agent_tools: evidence before
    # action, no claimed action without a tool call), wired through smolagents' hooks.
    sre_agent = CodeAgent(
        tools=[
            get_pod_breakdown,
            get_deployment_history,
            get_kubernetes_logs,
            scale_kubernetes_deployment,
            restart_kubernetes_deployment,
            restart_kubernetes_pod,
            rollback_kubernetes_deployment,
        ],
        model=model,
        add_base_tools=False,
        max_steps=10,
        step_callbacks=[guard_step_done],
        final_answer_checks=[guard_final_answer_check, claim_final_answer_check],
    )
else:
    sre_agent = CodeAgent(
        tools=[
            get_kubernetes_logs,
            scale_kubernetes_deployment,
            restart_kubernetes_deployment,
        ],
        model=model,
        add_base_tools=False,
        max_steps=6,  # a normal incident needs 2 (act, final_answer); caps LLM calls under the 15 RPM free tier
    )

INCIDENT_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "incident_log.csv")
INCIDENT_LOG_FIELDS = [
    "woke_at", "signature", "avg_cpu_per_pod", "throughput", "latency_p95",
    "active_replicas", "cpu_throttling", "memory_hit", "actions", "verification",
    "saved_to_memory", "agent_error", "llm_calls", "llm_retries", "llm_fallback_calls",
    "agent_seconds", "total_seconds", "final_answer",
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
    metrics = json.loads(metrics_json)

    cpu = round(metrics.get("avg_cpu_per_pod", 0), 2)
    tput = round(metrics.get("throughput", 0), 0)
    reps = int(metrics.get("active_replicas", 0))

    # Use the same five-metric feature contract as the anomaly detector.
    throttle = round(metrics.get("cpu_throttling", 0) * 100, 1)
    # p95 added 2026-10-01: without it a stuck app (p95 3 s, low CPU) and a mild
    # overload had nearly the same signature. agent_tools._SIGNATURE_RE still
    # parses the older form (it matches the prefix).
    p95 = round(metrics.get("latency_p95", 0), 2)

    return f"State -> CPU:{cpu}cores | Throttle:{throttle}% | Tput:{tput}rps | Reps:{reps} | P95:{p95}s"

# Prompt v5 (opt-in, AIOPS_PROMPT=v5; default stays v4 so measured runs are reproducible).
# Added 2026-10-01 evening after v4 failed the blind cpuhog test: v4 read "CPU 0.87" as
# overload and scaled up, then read "3 pods, 6 rps" as waste. The signal it lacked is CPU
# per request: real overload spends CPU on users (0.066 core-s/request, same as healthy),
# a runaway job spends it on itself (0.21-0.33). Computed by code: LLMs are poor at arithmetic.
# (PROMPT_VERSION is read near the top: it also selects the toolset.)
# Median of cpu * replicas / rps over baseline_metrics_healthy.csv (rps > 2): 0.073
# (mean 0.073, std 0.009, max 0.103).
HEALTHY_CPU_PER_REQUEST = 0.073


def _cpu_per_request_context(metrics):
    """v5 only: CPU cost per request vs the healthy training data, as prompt text."""
    rps = float(metrics.get("throughput") or 0)
    if rps < 1:
        return "CPU cost per request: not meaningful at < 1 rps."
    cost = float(metrics["avg_cpu_per_pod"]) * float(metrics["active_replicas"]) / rps
    ratio = cost / HEALTHY_CPU_PER_REQUEST
    return (f"CPU cost per request: {cost:.3f} core-seconds = {ratio:.1f}x the healthy value "
            f"({HEALTHY_CPU_PER_REQUEST} core-s, measured on healthy traffic; healthy readings never exceeded 0.10).")


V5_DERIVED_SECTION = """=== DERIVED SIGNAL (computed by the monitoring code) ===
{cpu_per_request}
- About 1x: the CPU is spent on user requests, so CPU pressure means real load (more pods help).
- Well above 1x (over ~2x): the CPU is being burned by something other than user traffic (a runaway
  background job, a busy loop). More pods will NOT fix it and per-pod metrics may look like waste after
  scaling. Call `get_kubernetes_logs()` and restart if the logs show a runaway or stuck process.

"""


# Short-term memory of this detector process (v6 prompt): what the agent did in the last
# minutes and how verification judged it. Long-term memory (ChromaDB) stores only verified
# successes, so on 2026-10-01 the agent repeated the same failed 3->1 three times in six
# minutes: each wake-up had no trace of the previous failure. Kept in-process on purpose:
# it expires by itself and cannot teach a stale lesson to a later, different incident.
RECENT_ACTIONS = []
RECENT_WINDOW_SECONDS = 15 * 60


def _remember_run(woke_at, actions, verdict, agent_error, response):
    RECENT_ACTIONS.append({"t": time.time(), "woke_at": woke_at, "actions": list(actions),
                           "verdict": verdict, "error": agent_error, "answer": response})


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
            verdict = r["verdict"] or "not verified"
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): {what} -> verification {verdict}")
        elif r["error"]:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action (agent error: {r['error'][:80]})")
        else:
            lines.append(f"- {r['woke_at'][11:]} ({ago} min ago): no action ({(r['answer'] or '')[:120]})")
    return "\n".join(lines)


V6_PROMPT = """
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent responsible for the backend deployment. An anomaly was detected by the Machine Learning monitor.
This IS your active task.

Current Metrics (whole deployment, 1-minute windows): {metrics_json}
Assigned Signature: "{signature}"

=== SYSTEM CAPACITY REFERENCE ===
Measured via load testing on the normal (login) workload. Use it to reason about whether the current replica count matches the traffic level.
{capacity}

=== YOUR RECENT ACTIONS (last 15 minutes; verdicts from the automatic verification) ===
{recent}

=== INCIDENT MEMORY (retrieved automatically from past verified incidents) ===
{memory}

=== CRITICAL RULES FOR CODE AGENTS ===
1. You MUST output executable Python code wrapped in ```python ... ``` blocks.
2. DO NOT write conversational text outside the python blocks.
3. YOU MUST ONLY EXECUTE ONE TOOL PER TURN. You cannot call multiple tools in the same python block. Call one tool, print its result, and STOP to wait for the system output.

=== YOUR TASK ===
Find the cause of the anomaly, fix it with the action that addresses that cause, and report.

Step 1 - INVESTIGATE. The metrics above are aggregates over all pods: they can hide a single bad pod, and they cannot show what changed. Observation tools:
  - `get_pod_breakdown()`: per pod: CPU, throttling, request rate, CPU cost per request, p95, 5xx rate, event-loop lag, memory, restarts, age, revision.
  - `get_deployment_history()`: recent revisions of the deployment and what changed in each.
  - `get_kubernetes_logs()`: warnings, errors and 5xx lines of every pod.
  Use as many as you need to explain the anomaly. Questions an experienced SRE asks: Is the resource usage consistent with the traffic? Is one pod different from the others? Did anything change shortly before the problem started? Do the logs show errors or warnings?

Step 2 - DECIDE. Service level objectives: latency p95 < 0.35 s | CPU throttling < 5% | CPU per pod < 0.75 cores.
  Identify the bottleneck before acting, then choose the action that addresses the cause:
  - Not enough capacity for the traffic (pods alike, CPU spent on serving requests, no errors): `scale_kubernetes_deployment(replicas=N)`, N from the capacity reference. Scale UP when CPU pressure violates the objectives or throughput approaches the safe limit of the current replicas; scale DOWN to the minimum safe count when the objectives are met and throughput is well below the capacity of the current replicas.
  - One pod misbehaving while the others are healthy: `restart_kubernetes_pod(pod_name=...)`.
  - The application is in a bad state in its running processes (stuck, erroring, burning resources): `restart_kubernetes_deployment()` (rolling, no downtime).
  - A recent change to the deployment caused the problem: `rollback_kubernetes_deployment()` (previous revision) or `rollback_kubernetes_deployment(revision=N)`.
  - Healthy for users and correctly provisioned: no action.
  More pods only help when CPU is the bottleneck. A restart only helps when the bad state lives in the running processes. If one of your recent actions failed verification, do not repeat it without new evidence: the cause is probably something else.

Step 3 - EXECUTE exactly one remediation action. The system verifies it automatically afterwards and wakes you again if the problem persists.
  If NO action is needed, do not call any action tool: call `final_answer("No action taken: <reason>")` WRAPPED IN A ```python ... ``` BLOCK and STOP.

Step 4 - REPORT: call `final_answer("Root cause: <one sentence, with the evidence>. Action: <what you did and why>.")` WRAPPED IN A ```python ... ``` BLOCK.
  Do NOT verify or save anything yourself: the system verifies the metrics and stores verified incidents in memory automatically after you finish.
"""


def _prompt_v4_v5(metrics_json, strict_signature, metrics, memory):
    """Prompts v4 (default) and v5, byte-identical to the measured runs."""
    return f"""
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent. An anomaly was detected by the Machine Learning monitor.
This IS your active task.

Current Metrics: {metrics_json}
Assigned Signature: "{strict_signature}"

=== SYSTEM CAPACITY REFERENCE ===
The following capacity limits were measured via load testing.
Use them to reason about whether the current replica count matches the traffic level.
{CAPACITY_CONTEXT}

{V5_DERIVED_SECTION.format(cpu_per_request=_cpu_per_request_context(metrics)) if PROMPT_VERSION == "v5" else ""}=== INCIDENT MEMORY (retrieved automatically from past verified incidents) ===
{memory}

=== CRITICAL RULES FOR CODE AGENTS ===
1. You MUST output executable Python code wrapped in ```python ... ``` blocks.
2. DO NOT write conversational text outside the python blocks.
3. YOU MUST ONLY EXECUTE ONE TOOL PER TURN. You cannot call multiple tools in the same python block. Call one tool, print its result, and STOP to wait for the system output.

=== YOUR TASK ===
Diagnose the anomaly, decide on the correct remediation, and execute it.

Step 1 — GATHER INFORMATION:
  - The metrics, capacity reference and incident memory above are usually enough. Overload and over-provisioning are visible in the metrics alone.
  - Call `get_kubernetes_logs()` ONLY if the metrics suggest application errors or a frozen app (e.g. high latency with low CPU). It returns only warnings, errors and 5xx lines.

Step 2 — REASON AND DECIDE (SRE HIERARCHICAL DECISION FRAMEWORK):
  Follow this strict 3-tier priority framework to make your decision:

  * TIER 1: SERVICE LEVEL OBJECTIVES & SYSTEM HEALTH (HIGHEST PRIORITY):
    - SLO Baseline Targets: Latency P95 < 0.35s | CPU Throttling < 5.0% | CPU per pod < 0.75 cores.
    - If Latency is elevated (> 0.35s) OR CPU Throttling is significant (> 5.0%) OR CPU per pod is near/above 0.75:
      -> The system is suffering from performance degradation and user SLOs are violated. Act now, but first identify the bottleneck.
      -> CPU bottleneck (CPU per pod near/above 0.75 OR throttling > 5%): more pods add CPU, so Scale UP is MANDATORY, REGARDLESS of whether throughput appears within the capacity table range.
      -> NOT a CPU bottleneck (latency high while CPU per pod is well below 0.75 and throttling is low): more pods will NOT fix it, because the pods are waiting on something, not computing. The app itself is stuck (deadlock, exhausted connection pool, hung dependency). Call `get_kubernetes_logs()`; if they show the app is stuck, call `restart_kubernetes_deployment()`.

  * TIER 2: CAPACITY PROVISIONING (TRAFFIC MATCHING):
    - Apply this ONLY if Tier 1 targets are met (latency is low and throttling is negligible).
    - Compare current throughput with the System Capacity Reference:
      -> If throughput is approaching or exceeding the safe limit of the current replicas, scale UP to the required replica count.

  * TIER 3: RESOURCE EFFICIENCY (SCALE DOWN):
    - Apply this when considering scaling DOWN due to low traffic/over-provisioning.
    - If Tier 1 targets are met and current throughput is significantly lower than the capacity of the current replicas, you MUST scale down to save resources.
    - Find the MINIMUM number of replicas that can safely handle the current throughput based on the System Capacity Reference.
    - If this minimum required replicas is lower than the current active replicas, call `scale_kubernetes_deployment` to scale down to that minimum number.

  * SUMMARY OF ACTIONS:
    - Scale UP: If Tier 1 is violated by a CPU bottleneck (CPU saturation / throttling, with or without high latency) OR Tier 2 demands more pods.
    - Scale DOWN: If Tier 1 is satisfied AND Tier 3 shows the system is over-provisioned for the current throughput.
    - Restart: If latency is high while CPU is low and the logs show the app is stuck (deadlock, exhausted pool, hung dependency).
    - NO ACTION: If the system is operating within healthy limits and current replicas perfectly match the traffic.

Step 3 — EXECUTE:
  - If an action is needed, call `scale_kubernetes_deployment(replicas=<int>)` (target deployment 'aiops-backend-deployment' is automatic) or `restart_kubernetes_deployment()`.
  - If NO ACTION is needed (e.g., hysteresis prevents scaling, or metrics are within safe limits despite the ML anomaly trigger), DO NOT call any execution tools. Instead, immediately call `final_answer("No action taken: <state your reason>")` WRAPPED IN A ```python ... ``` BLOCK and STOP.

Step 4 — REPORT (after the action succeeded, or right away for no action):
  - Call `final_answer("Root cause: <one sentence>. Action: <what you did and why>.")` WRAPPED IN A ```python ... ``` BLOCK.
  - Do NOT verify or save anything yourself: the system verifies the metrics and stores verified incidents in memory automatically after you finish.
"""


def _computed_facts(metrics):
    """v7: arithmetic the LLM should not do itself (LLMs are poor at it), as plain facts.
    Capacity lookup = the capacity table; CPU per request = v5's signal, but here WITHOUT a rule
    telling the agent what a high value means: the prompt only uses it to tell 'explained by the
    traffic' from 'something else', and the agent investigates the latter with its tools."""
    rps = float(metrics.get("throughput") or 0.0)
    reps = int(round(float(metrics.get("active_replicas") or 0)))
    lines = []
    if SAFE_RPS:
        covering = [n for n in sorted(SAFE_RPS) if SAFE_RPS[n] >= rps]
        need = covering[0] if covering else max(SAFE_RPS)
        beyond = "" if covering else " (the maximum allowed: the load exceeds every measured safe limit)"
        lines.append(f"- Load: {rps:.1f} rps on {reps} replica(s). Minimum replica count whose safe limit "
                     f"covers this load: {need}{beyond}.")
    else:
        lines.append("- Capacity reference unavailable.")
    if rps >= 1 and reps:
        cost = float(metrics["avg_cpu_per_pod"]) * reps / rps
        lines.append(f"- CPU per request: {cost:.3f} core-s = {cost / HEALTHY_CPU_PER_REQUEST:.1f}x the healthy "
                     f"reference ({HEALTHY_CPU_PER_REQUEST} core-s on healthy traffic; healthy readings stayed below "
                     f"{HEALTHY_CPU_PER_REQUEST_MAX}). Below ~3 rps per pod the process's idle CPU inflates it.")
    else:
        lines.append("- CPU per request: not meaningful below 1 rps.")
    return "\n".join(lines)


V7_PROMPT = """
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent responsible for the backend deployment. An anomaly was detected by the Machine Learning monitor.
This IS your active task.

Current Metrics (whole deployment, 1-minute windows): {metrics_json}
Assigned Signature: "{signature}"

=== SYSTEM CAPACITY REFERENCE ===
Measured via load testing on the normal workload. Use it to reason about whether the current replica count matches the traffic level.
{capacity}

=== COMPUTED FACTS (by the monitoring code from the metrics above; use them, do not recompute) ===
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
  (A) CAPACITY: the symptoms are explained by the traffic: CPU per request is close to the healthy reference and nothing else is abnormal (latency is not high while CPU is idle, the metrics show no errors). Go to Step 2A; no investigation is needed.
  (B) SOMETHING ELSE: CPU per request is far from the healthy reference, OR latency is high while CPU per pod is well below 0.75, OR you are not sure. Go to Step 2B.

Step 2A - CAPACITY (SLO: latency p95 < 0.35 s | CPU throttling < 5% | CPU per pod < 0.75 cores):
  - SLO violated by CPU pressure (CPU per pod near/above 0.75 or throttling > 5%), OR throughput approaching/exceeding the safe limit of the current replicas: scale UP with `scale_kubernetes_deployment(replicas=N)` to the minimum replica count in the facts, and at least one more than now.
  - SLO met and throughput significantly lower than the capacity of the current replicas: you MUST scale DOWN to save resources, to the minimum replica count in the facts.
  - SLO met and the current replica count already equals that minimum: no action.

Step 2B - INVESTIGATE, then act on the cause. Observation tools (one per step):
  - `get_pod_breakdown()`: per pod: CPU, throttling, request rate, CPU cost per request, p95, 5xx rate, event-loop lag, memory, restarts, age, revision.
  - `get_deployment_history()`: recent revisions of the deployment and what changed in each.
  - `get_kubernetes_logs()`: warnings, errors and 5xx lines of every pod.
  Then choose the action that addresses the cause:
  - One pod clearly misbehaving while the others are healthy (errors, or event-loop lag or CPU per request several times the other pods'): `restart_kubernetes_pod(pod_name=...)`. Uneven CPU between pods under load is normal load imbalance, not a fault.
  - The application is in a bad state in its running processes (stuck, erroring, burning CPU without serving the traffic): `restart_kubernetes_deployment()` (rolling, no downtime).
  - A recent change to the deployment caused the problem: `rollback_kubernetes_deployment()` (previous revision) or `rollback_kubernetes_deployment(revision=N)`.
  - It is capacity after all: scale as in Step 2A.
  More pods only help when CPU is the bottleneck. A restart only helps when the bad state lives in the running processes. A rollback only helps when a change caused it. If one of your recent actions failed verification, do not repeat it without new evidence: the cause is probably something else.

Step 3 - EXECUTE exactly one remediation action, or none. The system verifies it automatically afterwards and wakes you again if the problem persists.

Step 4 - REPORT in a later step than the action: `final_answer("Root cause: <one sentence, with the evidence>. Action: <what you did and why>.")`, or `final_answer("No action taken: <reason>")`, WRAPPED IN A ```python ... ``` BLOCK.
  Do NOT verify or save anything yourself: the system verifies the metrics and stores verified incidents in memory automatically after you finish.
"""


# v8 (2026-10-03 21:45) = v7 + diagnosis before a disruptive action (code guard, agent_tools) and an
# evidence-based restart rule: check what changed first; restart only with evidence of a bad process state.
V8_PROMPT = """
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent responsible for the backend deployment. An anomaly was detected by the Machine Learning monitor.
This IS your active task.

Current Metrics (whole deployment, 1-minute windows): {metrics_json}
Assigned Signature: "{signature}"

=== SYSTEM CAPACITY REFERENCE ===
Measured via load testing on the normal workload. Use it to reason about whether the current replica count matches the traffic level.
{capacity}

=== COMPUTED FACTS (by the monitoring code from the metrics above; use them, do not recompute) ===
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
  (A) CAPACITY: the symptoms are explained by the traffic: CPU per request is close to the healthy reference and nothing else is abnormal (latency is not high while CPU is idle, the metrics show no errors). Go to Step 2A; no investigation is needed.
  (B) SOMETHING ELSE: CPU per request is far from the healthy reference, OR latency is high while CPU per pod is well below 0.75, OR you are not sure. Go to Step 2B.

Step 2A - CAPACITY (SLO: latency p95 < 0.35 s | CPU throttling < 5% | CPU per pod < 0.75 cores):
  - SLO violated by CPU pressure (CPU per pod near/above 0.75 or throttling > 5%), OR throughput approaching/exceeding the safe limit of the current replicas: scale UP with `scale_kubernetes_deployment(replicas=N)` to the minimum replica count in the facts, and at least one more than now.
  - SLO met and throughput significantly lower than the capacity of the current replicas: you MUST scale DOWN to save resources, to the minimum replica count in the facts.
  - SLO met and the current replica count already equals that minimum: no action.

Step 2B - INVESTIGATE, then act on the cause. Look at ALL THREE observation tools, one per step (the system refuses a restart or a rollback until you have):
  - `get_pod_breakdown()`: per pod: CPU, throttling, request rate, CPU cost per request, p95, 5xx rate, event-loop lag, memory, restarts, age, revision.
  - `get_deployment_history()`: recent revisions of the deployment and what changed in each.
  - `get_kubernetes_logs()`: warnings, errors and 5xx lines of every pod.
  Then choose the action that addresses the cause, in this order:
  - A change to the deployment shortly before the problem started (deployment history): `rollback_kubernetes_deployment()` (previous revision) or `rollback_kubernetes_deployment(revision=N)`. A restart would recreate the same bad configuration.
  - One pod clearly misbehaving while the others are healthy (errors, or event-loop lag or CPU per request several times the other pods'): `restart_kubernetes_pod(pod_name=...)`. Uneven CPU between pods under load is normal load imbalance, not a fault.
  - EVIDENCE of a bad state in the running processes: ERROR lines or a stuck / runaway job in the logs, or event-loop lag or CPU per request several times the healthy reference: `restart_kubernetes_deployment()` (rolling, no downtime). Warnings that only repeat the symptom (e.g. "High latency detected") are not evidence of a cause.
  - It is capacity after all: scale as in Step 2A.
  - No evidence of a cause and the SLO breach is small or short (e.g. right after a restart or a scale, when new pods warm up): it may be a transient. Answer "No action taken: <reason>"; the monitor wakes you again if it persists.
  More pods only help when CPU is the bottleneck. A restart only helps when the bad state lives in the running processes. A rollback only helps when a change caused it. If one of your recent actions failed verification, do not repeat it without new evidence: the cause is probably something else.

Step 3 - EXECUTE exactly one remediation action, or none. The system verifies it automatically afterwards and wakes you again if the problem persists.

Step 4 - REPORT in a later step than the action: `final_answer("Root cause: <one sentence, with the evidence>. Action: <what you did and why>.")`, or `final_answer("No action taken: <reason>")`, WRAPPED IN A ```python ... ``` BLOCK.
  Do NOT verify or save anything yourself: the system verifies the metrics and stores verified incidents in memory automatically after you finish.
"""


def trigger_ai_agent(metrics_json):
    """
    Function called from anomaly_detector.py when an anomaly is detected.
    """
    started = time.monotonic()
    woke_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    strict_signature = generate_deterministic_signature(metrics_json)
    metrics = json.loads(metrics_json)
    # AIOPS_MEMORY=off: ablation for the RAG research question (no lookup, nothing saved).
    memory_on = os.getenv("AIOPS_MEMORY", "on").lower() != "off"
    memory = query_knowledge_base(strict_signature, metrics) if memory_on else "Incident memory disabled for this run."

    if PROMPT_VERSION == "v8":
        prompt = V8_PROMPT.format(metrics_json=metrics_json, signature=strict_signature, capacity=CAPACITY_CONTEXT,
                                  facts=_computed_facts(metrics), recent=_recent_actions_text(), memory=memory)
    elif PROMPT_VERSION == "v7":
        prompt = V7_PROMPT.format(metrics_json=metrics_json, signature=strict_signature, capacity=CAPACITY_CONTEXT,
                                  facts=_computed_facts(metrics), recent=_recent_actions_text(), memory=memory)
    elif PROMPT_VERSION == "v6":
        prompt = V6_PROMPT.format(metrics_json=metrics_json, signature=strict_signature,
                                  capacity=CAPACITY_CONTEXT, recent=_recent_actions_text(), memory=memory)
    else:
        prompt = _prompt_v4_v5(metrics_json, strict_signature, metrics, memory)

    print(f"\n🤖 [AIOps Agent] Agent woke up (prompt {PROMPT_VERSION})! Assigned Signature: {strict_signature}")
    print(f"🧠 [Memory] {memory}\n")

    reset_run_outcome()
    model.reset_stats()
    response, agent_error = "", ""
    if PROMPT_VERSION in ("v7", "v8"):
        # AIOPS_ACT_GUARD=off disables the guards (ablation); on by default for v7/v8.
        # v8 adds the diagnosis rule: no restart/rollback before all three observation tools were used.
        guard_start(enforce=os.getenv("AIOPS_ACT_GUARD", "on").lower() != "off",
                    require_diagnosis=PROMPT_VERSION == "v8")
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
    verdict = ""
    saved = ""
    if not actions:
        resolved = not agent_error
        print(f"\n [AIOps Agent] No action applied to the cluster.\nAgent Final Output: {response}")
    else:
        print(f"\n [AIOps Agent] Actions {actions} applied. Verifying...")
        print(verify_metrics_stabilization(metrics_json))
        # Kept here: a rollback goes through the scale tool, which resets run_outcome.
        verdict = run_outcome["verification"] or ""
        resolved = verdict == "STABLE"
        if resolved:
            root_cause = response or f"(no LLM summary: {agent_error[:150]})"
            saved = (save_resolution_to_chroma(strict_signature, root_cause[:500], "; ".join(actions), metrics)
                     if memory_on else "Not saved: memory disabled (AIOPS_MEMORY=off).")
            print(f"💾 [Memory] {saved}")
            print(f"\n [AIOps Agent] Actions {actions} verified STABLE.\nSummary: {response}")
        else:
            print(f"\n [AIOps Agent] Actions {actions} not confirmed (verification: {verdict}).")
            print(f"Agent Final Output: {response}")
            rollback = _rollback_failed_scale_down(actions)
            if rollback:
                actions.append(rollback)

    _remember_run(woke_at, actions, verdict, agent_error, response)
    _log_incident({
        "woke_at": woke_at,
        "signature": strict_signature,
        **{k: metrics.get(k) for k in ["avg_cpu_per_pod", "throughput", "latency_p95", "active_replicas", "cpu_throttling"]},
        "memory_hit": "past incident(s) at" in memory,
        "actions": "; ".join(actions),
        "verification": verdict,
        "saved_to_memory": saved.startswith("Success"),
        "agent_error": agent_error[:300],
        "llm_calls": model.stats["calls"],
        "llm_retries": model.stats["retries"],
        "llm_fallback_calls": model.stats["fallback_calls"],
        "agent_seconds": round(agent_seconds, 1),
        "total_seconds": round(time.monotonic() - started, 1),
        "final_answer": response[:500],
    })
    return resolved
