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
)

# API key from Google AI Studio (the root .env is not auto-loaded).
if not os.getenv("GEMINI_API_KEY"):
    raise SystemExit("GEMINI_API_KEY is not set: export it before running the live detector.")

PRIMARY_MODEL = "gemini/gemini-3.1-flash-lite"
# Optional second model, used only after the primary keeps failing (e.g. Gemini 503
# "high demand"). Every call that used it is counted in incident_log.csv.
FALLBACK_MODEL = os.getenv("AIOPS_FALLBACK_MODEL")

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
    content = getattr(message, "content", None)
    if getattr(message, "tool_calls", None):
        return False
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

# The LLM decides and acts; code does everything around it (memory lookup before
# the run, verification and memory save after it). add_base_tools=False: the
# default extras (web search, page visits, ...) have no place in an SRE agent.
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

    prompt = f"""
[ALERT - AIOPS TRIGGER]
You are an Autonomous SRE Agent. An anomaly was detected by the Machine Learning monitor.
This IS your active task.

Current Metrics: {metrics_json}
Assigned Signature: "{strict_signature}"

=== SYSTEM CAPACITY REFERENCE ===
The following capacity limits were measured via load testing.
Use them to reason about whether the current replica count matches the traffic level.
{CAPACITY_CONTEXT}

=== INCIDENT MEMORY (retrieved automatically from past verified incidents) ===
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

    print(f"\n🤖 [AIOps Agent] Agent woke up! Assigned Signature: {strict_signature}")
    print(f"🧠 [Memory] {memory}\n")

    reset_run_outcome()
    model.reset_stats()
    response, agent_error = "", ""
    try:
        response = str(sre_agent.run(prompt))
    except Exception as e:
        # Actions already applied before the error are still verified below.
        agent_error = f"{type(e).__name__}: {e}"
        print(f"\n[AIOps Agent] Agent crashed during execution: {e}")
    agent_seconds = time.monotonic() - started

    # Judge success from what the tools recorded, not from the LLM's text.
    actions = list(run_outcome["actions"])
    saved = ""
    if not actions:
        resolved = not agent_error
        print(f"\n [AIOps Agent] No action applied to the cluster.\nAgent Final Output: {response}")
    else:
        print(f"\n [AIOps Agent] Actions {actions} applied. Verifying...")
        print(verify_metrics_stabilization(metrics_json))
        resolved = run_outcome["verification"] == "STABLE"
        if resolved:
            root_cause = response or f"(no LLM summary: {agent_error[:150]})"
            saved = (save_resolution_to_chroma(strict_signature, root_cause[:500], "; ".join(actions), metrics)
                     if memory_on else "Not saved: memory disabled (AIOPS_MEMORY=off).")
            print(f"💾 [Memory] {saved}")
            print(f"\n [AIOps Agent] Actions {actions} verified STABLE.\nSummary: {response}")
        else:
            print(f"\n [AIOps Agent] Actions {actions} not confirmed (verification: {run_outcome['verification']}).")
            print(f"Agent Final Output: {response}")
            rollback = _rollback_failed_scale_down(actions)
            if rollback:
                actions.append(rollback)

    _log_incident({
        "woke_at": woke_at,
        "signature": strict_signature,
        **{k: metrics.get(k) for k in ["avg_cpu_per_pod", "throughput", "latency_p95", "active_replicas", "cpu_throttling"]},
        "memory_hit": "past incident(s) at" in memory,
        "actions": "; ".join(actions),
        "verification": run_outcome["verification"] or "",
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
