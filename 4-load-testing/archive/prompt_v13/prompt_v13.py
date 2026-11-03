"""
The prompt of agents v9-v13 (2026-10-22 -> 2026-11-03), kept verbatim for the prompt evaluation of A33
(4-load-testing/prompt_eval.py): AGENT_PROMPT (one task text; smolagents' default system prompt with <code> tags),
the capacity context, the "signature" and the computed facts as v13 built them. Replaced in agent v14 (A33).
Copied from 3-ai-agent/agent.py at commit 6249f9a; only the module header and the imports are new.
"""
import json

import health_model
import nfr_metrics

def _health_bundle():
    import agent_tools
    return agent_tools._health_bundle()

def capacity_context(CAPACITY):
    if not CAPACITY:
        return "(Capacity data unavailable: re-run 5-ml-training/capacity_discovery.py.)"
    lines = []
    for n, v in sorted(CAPACITY.items()):
        limit = v.get("slo_limit_rps")
        lines.append(f"  - {n} pod(s): serves up to ~{v['max_safe_rps']:g} rps with p95 <= ~{v.get('p95_at_safe', 0.25)} s"
                     + (f"; the {nfr_metrics.NFR_P95:g} s objective breaks at ~{limit:g} rps" if limit else ""))
    return "\n".join(lines)

def generate_deterministic_signature(metrics_json):
    m = json.loads(metrics_json)
    return (f"State -> Pods:{int(round(m.get('replicas', 0)))} | Load:{round(m.get('throughput', 0))}rps "
            f"({m.get('rps_per_pod', 0):.0f}/pod) | P95:{m.get('latency_p95', 0):.2f}s | "
            f"Errors:{100 * (m.get('error_rate') or 0):.1f}%")

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
