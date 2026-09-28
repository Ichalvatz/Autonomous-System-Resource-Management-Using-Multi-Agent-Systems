import os
import json
from smolagents import CodeAgent, LiteLLMModel
from agent_tools import (
    query_knowledge_base,
    get_kubernetes_logs,
    scale_kubernetes_deployment,
    save_resolution_to_chroma,
    verify_metrics_stabilization,
    restart_kubernetes_deployment,
)

# Set up the API key from Google AI Studio
os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY")

# Initialize the free Gemini model via LiteLLM
model = LiteLLMModel(model_id="gemini/gemini-3.1-flash-lite")

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
        max_safe = entry.get("max_safe_vus", "?")
        breaking = entry.get("breaking_vus", "?")
        reason = entry.get("breaking_reason", "")
        reason_str = f" [Breaking trigger: {reason}]" if reason else ""
        lines.append(
            f"  - {replicas_str} replica(s): safe up to ~{max_safe} rps, "
            f"breaks at ~{breaking} rps{reason_str}"
        )
    return "\n".join(lines)

CAPACITY_CONTEXT = _load_capacity_context()

# Create the SRE agent with action-only tools
sre_agent = CodeAgent(
    tools=[
        query_knowledge_base,
        get_kubernetes_logs,
        scale_kubernetes_deployment,
        save_resolution_to_chroma,
        verify_metrics_stabilization,
        restart_kubernetes_deployment,
    ],
    model=model,
    add_base_tools=True,
)

def generate_deterministic_signature(metrics_json):
    metrics = json.loads(metrics_json)

    cpu = round(metrics.get("avg_cpu_per_pod", 0), 2)
    tput = round(metrics.get("throughput", 0), 0)
    reps = int(metrics.get("active_replicas", 0))

    # Use the same five-metric feature contract as the anomaly detector.
    throttle = round(metrics.get("cpu_throttling", 0) * 100, 1)

    return f"State -> CPU:{cpu}cores | Throttle:{throttle}% | Tput:{tput}rps | Reps:{reps}"

def trigger_ai_agent(metrics_json):
    """
    Function called from anomaly_detector.py when an anomaly is detected.
    """
    strict_signature = generate_deterministic_signature(metrics_json)

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

=== CRITICAL RULES FOR CODE AGENTS ===
1. You MUST output executable Python code wrapped in ```python ... ``` blocks.
2. DO NOT write conversational text outside the python blocks.
3. YOU MUST ONLY EXECUTE ONE TOOL PER TURN. You cannot call multiple tools in the same python block. Call one tool, print its result, and STOP to wait for the system output.

=== YOUR TASK ===
Diagnose the anomaly, decide on the correct remediation, and execute it.

Step 1 — GATHER INFORMATION:
  - Call `query_knowledge_base` with the Assigned Signature to check for similar past incidents.
  - Optionally call `get_kubernetes_logs()` if the metrics suggest application errors (deployment 'aiops-backend-deployment' is automatic).

Step 2 — REASON AND DECIDE (SRE HIERARCHICAL DECISION FRAMEWORK):
  Follow this strict 3-tier priority framework to make your decision:

  * TIER 1: SERVICE LEVEL OBJECTIVES & SYSTEM HEALTH (HIGHEST PRIORITY):
    - SLO Baseline Targets: Latency P95 < 0.300s (300ms) | CPU Throttling < 5.0% | CPU per pod < 0.75 cores.
    - If Latency is elevated (> 0.35s) OR CPU Throttling is significant (> 5.0%) OR CPU per pod is near/above 0.75:
      -> The system is suffering from performance degradation and user SLOs are violated.
      -> Remediation (Scale UP) is MANDATORY to relieve pressure, REGARDLESS of whether throughput appears within the capacity table range.
      -> EXCEPTION (Deadlock / Zombie): If Latency is very high (> 1.0s) but CPU and Throughput are near 0, the app is frozen/deadlocked — scaling will not help, call `restart_kubernetes_deployment()`.

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
    - Scale UP: If Tier 1 is violated (high latency / throttling / CPU saturation) OR Tier 2 demands more pods.
    - Scale DOWN: If Tier 1 is satisfied AND Tier 3 shows the system is over-provisioned for the current throughput.
    - Restart: Only if app is deadlocked/frozen (high latency, zero throughput/CPU).
    - NO ACTION: If the system is operating within healthy limits and current replicas perfectly match the traffic.

Step 3 — EXECUTE:
  - If an action is needed, call `scale_kubernetes_deployment(replicas=<int>)` (target deployment 'aiops-backend-deployment' is automatic) or `restart_kubernetes_deployment()`.
  - If NO ACTION is needed (e.g., hysteresis prevents scaling, or metrics are within safe limits despite the ML anomaly trigger), DO NOT call any execution tools. Instead, immediately call `final_answer("No action taken: <state your reason>")` WRAPPED IN A ```python ... ``` BLOCK and STOP.

Step 4 — VERIFY AND REMEMBER (Only if you took an action in Step 3):
  - Call `verify_metrics_stabilization` with the exact Current Metrics JSON as `pre_action_metrics_json`.
  - If verification is successful, call `save_resolution_to_chroma` to store the anomaly signature, root cause, and action taken.
  - End by calling `final_answer("Action taken. System is verified and stable.")`.
"""

    print(f"\n🤖 [AIOps Agent] Agent woke up! Assigned Signature: {strict_signature}\n")
    
    try:
        response = str(sre_agent.run(prompt))
        
        success_indicators = ["success", "resolved", "fixed", "saved", "scaled", "restarted", "verified", "stable", "no action"]
        
        is_successful = any(indicator in response.lower() for indicator in success_indicators)

        if is_successful:
            print(f"\n [AIOps Agent] Process completed successfully.\nSummary: {response}")
            return True
        else:
            print("\n [AIOps Agent] Process completed, but resolution is unconfirmed.")
            print(f"Agent Final Output: {response}")
            return False
            
    except Exception as e:
        print(f"\n[AIOps Agent] Agent crashed during execution: {e}")
        return False
