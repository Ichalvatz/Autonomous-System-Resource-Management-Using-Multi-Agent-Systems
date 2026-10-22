"""
Tools of the AIOps agent and the code around them (agent v9, thesis phase 2, 2026-10-22: NFR-driven;
thesis_notes/design_decisions.md A24). v8.1 and earlier: git tag v8.1-campaign, thesis_notes/removed_and_archived.md.

THE 5 LLM TOOLS: the only things the LLM can call (agent.py passes them to the CodeAgent in this order).
  Observe (read-only):
    1. get_pod_breakdown()            per pod: CPU, throttling, req/s, CPU per request, p95, 5xx, event-loop lag,
                                      memory, restarts, age, revision, ready or not
    2. get_deployment_history()       recent revisions and what changed in each (image, env, limits, restart)
    3. get_kubernetes_logs()          warning / error / 5xx lines of every pod
  Act (guarded; each one targets only default/aiops-backend-deployment and records what it applied):
    4. scale_kubernetes_deployment(replicas)      capacity: 1-3 replicas, at most +-2 per call, 30 s cooldown
    5. restart_kubernetes_deployment()            bad state in the running processes: rolling restart of the
                                                  whole app, 60 s cooldown
  Removed 2026-10-22 (the user's decision for phase 2): restart of one pod, rollback of a revision.

CODE AROUND THE LLM (not tools, so the LLM can neither skip nor fake them):
  - guards: evidence before action; no claimed action without a tool call; full diagnosis before a
    restart (active only during an agent run)
  - verification of every action by the trajectory of the health model's score (verify_metrics_stabilization),
    called by agent.py after the run: improving -> wait; normal -> STABLE; worse or stuck -> UNSTABLE (re-wake)
  - incident memory in ChromaDB, in the health model's own space: lookup before the run, save after it

Order of this file: configuration, shared helpers, observation tools, action tools, guards, verification,
incident memory.
"""
import os
import re
import math
import time
import datetime
import json
import requests
# pyrefly: ignore [missing-import]
import chromadb
from smolagents import tool
from kubernetes import client, config

import health_model
import nfr_metrics


# ===== Configuration ==========================================================================
PROMETHEUS_URL = "http://prometheus.aiops"
ALLOWED_NAMESPACE = "default"
ALLOWED_DEPLOYMENT = "aiops-backend-deployment"
MIN_REPLICAS = 1
MAX_REPLICAS = 3  # Host CPU limit: >3 x 1-core pods saturates the laptop (see "Pod sizing" in CLAUDE.md)
MAX_SCALE_DELTA = 2
SCALE_COOLDOWN_SECONDS = 30
RESTART_COOLDOWN_SECONDS = 60


# Healthy reference for the per-pod view (diagnosis only, not used by the detector), for the phase-2 request
# mix, from the healthy training data (baseline_metrics_healthy_filtered.csv, 2026-10-23, readings with >= 5 rps
# per pod): CPU cost per request median 0.0084 core-s, max 0.016; per-pod p95 within the NFR-safe 0.25 s.
# Throttling is no longer a clean overload signal with the mix (up to ~25% per pod at the top of a healthy band:
# several requests share each 100 ms CFS period), so it is shown but not stressed.
HEALTHY_CPU_PER_REQUEST = 0.0084
HEALTHY_CPU_PER_REQUEST_MAX = 0.016
HEALTHY_POD_P95 = 0.25
HEALTHY_POD_THROTTLING = 0.25


REVISION_ANNOTATION = "deployment.kubernetes.io/revision"
HISTORY_ANNOTATION = "deployment.kubernetes.io/revision-history"


# Time of the last action of each kind (cooldowns).
_last_scale_action_at = 0.0
_last_restart_action_at = 0.0


# ===== Shared helpers ===========================================================================
# Ground truth of what happened during one agent run, recorded by the tools
# themselves so that success is judged from facts, not from the LLM's wording.
#   actions:      actions actually applied to the cluster
#   verification: STABLE / UNSTABLE / UNVERIFIABLE for the latest action, or None
#   detail:       the verification's reason and score trajectory (for the logs, recent actions and memory)
#   recovery_s:   seconds from the end of the rollout to the STABLE verdict
#   score_after:  the last score the verification saw
run_outcome = {"actions": [], "verification": None, "detail": "", "recovery_s": None, "score_after": None,
               "rollout": ""}


def reset_run_outcome():
    run_outcome.update(actions=[], verification=None, detail="", recovery_s=None, score_after=None)


def _record_action(description):
    run_outcome["actions"].append(description)
    # A new action invalidates any earlier verification.
    run_outcome.update(verification=None, detail="", recovery_s=None, score_after=None)


def get_kube_config():
    """Dynamically loads the correct Kubernetes configuration."""
    try:
        config.load_incluster_config()
    except config.ConfigException:
        config.load_kube_config()


def _cooldown_error(action_name, last_action_at, cooldown_seconds):
    elapsed = time.monotonic() - last_action_at
    remaining = cooldown_seconds - elapsed
    if remaining > 0:
        return f"Safety cooldown: {action_name} blocked for {remaining:.0f}s."
    return None


_POD = 'namespace="default", pod=~"aiops-backend-deployment-.*"'
POD_QUERIES = {
    "cpu": f'sum by (pod) (rate(container_cpu_usage_seconds_total{{{_POD}, container!=""}}[1m]))',
    "throttling": (f'sum by (pod) (increase(container_cpu_cfs_throttled_periods_total{{{_POD}, container!=""}}[1m]))'
                   f' / sum by (pod) (increase(container_cpu_cfs_periods_total{{{_POD}, container!=""}}[1m]))'),
    "rps": 'sum by (pod) (rate(http_requests_total{app="aiops-backend"}[1m]))',
    "errors": 'sum by (pod) (rate(http_requests_total{app="aiops-backend", status_code=~"5.."}[1m]))',
    "p95": 'histogram_quantile(0.95, sum by (pod, le) (rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])))',
    "lag": f'max by (pod) (nodejs_eventloop_lag_p99_seconds{{{_POD}}})',
    "memory": f'sum by (pod) (container_memory_working_set_bytes{{{_POD}, container!=""}})',
    "memory_limit": f'sum by (pod) (kube_pod_container_resource_limits{{{_POD}, resource="memory"}})',
    "restarts": f'sum by (pod) (kube_pod_container_status_restarts_total{{{_POD}}})',
}


def _prom_by_pod(query):
    """{pod: value} for a PromQL query grouped by pod; NaN values are dropped."""
    response = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=5)
    response.raise_for_status()
    out = {}
    for item in response.json().get("data", {}).get("result", []):
        pod = item.get("metric", {}).get("pod")
        try:
            value = float(item["value"][1])
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if pod and value == value:
            out[pod] = value
    return out


def _age(start, now=None):
    if start is None:
        return "?"
    now = now or datetime.datetime.now(datetime.timezone.utc)
    seconds = int((now - start).total_seconds())
    if seconds >= 3600:
        return f"{seconds // 3600}h{seconds % 3600 // 60:02d}m"
    return f"{seconds // 60}m{seconds % 60:02d}s" if seconds >= 60 else f"{seconds}s"


def _owned_replica_sets(apps_v1):
    """ReplicaSets of the allowed deployment, keyed by revision number."""
    rss = apps_v1.list_namespaced_replica_set(namespace=ALLOWED_NAMESPACE, label_selector="app=aiops-backend")
    by_revision = {}
    for rs in rss.items:
        owners = rs.metadata.owner_references or []
        if not any(o.kind == "Deployment" and o.name == ALLOWED_DEPLOYMENT for o in owners):
            continue
        revision = (rs.metadata.annotations or {}).get(REVISION_ANNOTATION)
        if revision is not None:
            by_revision[int(revision)] = rs
    return by_revision


# ===== Observation tools (1-3): read-only, the toolbox of an on-call engineer ===================
# The detector's five metrics are aggregates over all pods: they cannot show WHICH pod is sick or WHAT
# changed. These three tools can. Each one marks itself as observed for the guards below.
# --- 1. get_pod_breakdown ---
@tool
def get_pod_breakdown() -> str:
    """
    Shows every backend pod separately (1-minute windows): CPU and CPU throttling, request
    rate, CPU cost per request, p95 latency, 5xx error rate, Node.js event-loop lag, memory,
    container restarts, age and deployment revision. Use it to see whether one pod differs
    from the others and whether resource usage is consistent with the traffic each pod serves.
    """
    _guard_observed("get_pod_breakdown")
    try:
        get_kube_config()
        core_v1 = client.CoreV1Api()
        apps_v1 = client.AppsV1Api()
        pods = core_v1.list_namespaced_pod(namespace=ALLOWED_NAMESPACE, label_selector="app=aiops-backend").items
        pods = [p for p in pods if p.metadata.name.startswith(ALLOWED_DEPLOYMENT)]
        if not pods:
            return f"No pods found for deployment {ALLOWED_DEPLOYMENT}."
        revision_of_hash = {}
        for revision, rs in _owned_replica_sets(apps_v1).items():
            revision_of_hash[(rs.metadata.labels or {}).get("pod-template-hash")] = revision
        values = {name: _prom_by_pod(q) for name, q in POD_QUERIES.items()}
    except Exception as e:
        return f"Error building the pod breakdown: {e}"

    lines = [f"{len(pods)} backend pod(s). Healthy reference (healthy traffic of the normal request mix): "
             f"CPU per request ~{HEALTHY_CPU_PER_REQUEST} core-s (max {HEALTHY_CPU_PER_REQUEST_MAX}), "
             f"p95 <= {HEALTHY_POD_P95} s, throttling <= {HEALTHY_POD_THROTTLING:.0%}. Below ~5 req/s per pod the "
             "process's idle CPU inflates CPU per request. A pod that is not ready receives no traffic."]
    for pod in sorted(pods, key=lambda p: p.metadata.name):
        name = pod.metadata.name
        get = lambda key: values[key].get(name)
        ready = any(c.type == "Ready" and c.status == "True" for c in (pod.status.conditions or []))
        state = "terminating" if pod.metadata.deletion_timestamp else ("ready" if ready else f"not ready ({pod.status.phase})")
        revision = revision_of_hash.get((pod.metadata.labels or {}).get("pod-template-hash"), "?")
        cpu, rps = get("cpu"), get("rps")
        cost = f"{cpu / rps:.3f} core-s" if cpu is not None and rps and rps >= 0.5 else "n/a (too few requests)"
        fmt = lambda v, f: f.format(v) if v is not None else "n/a"
        memory = fmt(get("memory"), "{:.0f}") if get("memory") is None else f"{get('memory') / 2**20:.0f} MiB"
        limit = f" / {get('memory_limit') / 2**20:.0f} MiB limit" if get("memory_limit") else ""
        lines.append(
            f"- {name} | revision {revision} | age {_age(pod.status.start_time)} | {state} | "
            f"container restarts {fmt(get('restarts'), '{:.0f}')}\n"
            f"    CPU {fmt(cpu, '{:.2f}')} cores (throttled {fmt(get('throttling') and get('throttling') * 100, '{:.1f}')}%) | "
            f"{fmt(rps, '{:.1f}')} req/s | CPU per request {cost} | p95 {fmt(get('p95'), '{:.2f}')} s | "
            f"5xx {fmt(get('errors') or 0.0, '{:.2f}')}/s | event-loop lag p99 {fmt(get('lag'), '{:.2f}')} s | "
            f"memory {memory}{limit}"
        )
    return "\n".join(lines)


# --- 2. get_deployment_history (and its helpers) ---
def _template_summary(rs):
    container = rs.spec.template.spec.containers[0]
    env = {e.name: (e.value if e.value is not None else "<from secret/config>") for e in (container.env or [])}
    limits = (container.resources.limits or {}) if container.resources else {}
    restarted = ((rs.spec.template.metadata.annotations or {}).get("kubectl.kubernetes.io/restartedAt"))
    return {"image": container.image, "env": env, "limits": dict(limits), "restartedAt": restarted}


def _describe_change(old, new):
    if old is None:
        return "oldest revision kept"
    changes = []
    if old["image"] != new["image"]:
        changes.append(f"image {old['image']} -> {new['image']}")
    for key in sorted(set(old["env"]) | set(new["env"])):
        if key not in old["env"]:
            changes.append(f"env {key}={new['env'][key]} added")
        elif key not in new["env"]:
            changes.append(f"env {key} removed")
        elif old["env"][key] != new["env"][key]:
            changes.append(f"env {key}: {old['env'][key]} -> {new['env'][key]}")
    if old["limits"] != new["limits"]:
        changes.append(f"resource limits {old['limits']} -> {new['limits']}")
    if not changes and old["restartedAt"] != new["restartedAt"]:
        changes.append("rolling restart only (no change to image, env or resources)")
    return "; ".join(changes) or "no visible change"


def _activation_times(core_v1):
    """{replicaset name: last time the deployment scaled it up from 0} from the deployment's events
    (kept ~1 h by Kubernetes): when a re-used ReplicaSet became current again."""
    events = core_v1.list_namespaced_event(
        namespace=ALLOWED_NAMESPACE,
        field_selector=f"involvedObject.kind=Deployment,involvedObject.name={ALLOWED_DEPLOYMENT}").items
    out = {}
    for e in events:
        match = re.search(r"Scaled up replica set (\S+) from 0 to", e.message or "")
        stamp = e.last_timestamp or e.event_time or e.metadata.creation_timestamp
        if match and stamp and (match.group(1) not in out or stamp > out[match.group(1)]):
            out[match.group(1)] = stamp
    return out


@tool
def get_deployment_history() -> str:
    """
    Lists the recent revisions of the backend deployment (newest first): when each was
    created and what changed compared with the revision before it (image, environment
    variables, resource limits, or a plain rolling restart). Use it to check whether a
    change to the deployment coincides with the start of the problem.
    """
    _guard_observed("get_deployment_history")
    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        dep = apps_v1.read_namespaced_deployment(name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE)
        current = int((dep.metadata.annotations or {}).get(REVISION_ANNOTATION, 0))
        by_revision = _owned_replica_sets(apps_v1)
        activated = _activation_times(client.CoreV1Api())
    except Exception as e:
        return f"Error reading the deployment history: {e}"
    if not by_revision:
        return "No revision history found."
    # A rollback re-uses the old ReplicaSet: it gets a new revision number and keeps the
    # old ones in "revision-history". Expand them, so every revision is listed with the
    # template it ran, and diffs compare consecutive revisions in time. (Bug fix 2026-10-03,
    # found in a live test of the tool: without it a re-applied revision showed its first
    # creation time and the revision it replaced vanished from the list.)
    template_of, first_rev_of_rs = {}, {}
    for latest, rs in by_revision.items():
        older = [int(x) for x in (rs.metadata.annotations or {}).get(HISTORY_ANNOTATION, "").split(",") if x.strip()]
        for r in older + [latest]:
            template_of[r] = rs
        first_rev_of_rs[latest] = min(older + [latest])
    now = datetime.datetime.now(datetime.timezone.utc)
    revisions = sorted(template_of)
    summaries = {r: _template_summary(template_of[r]) for r in revisions}
    lines = [f"Deployment {ALLOWED_DEPLOYMENT}: current revision {current}, "
             f"{dep.status.available_replicas or 0}/{dep.spec.replicas} replicas available. Newest first:"]
    for i in range(len(revisions) - 1, -1, -1):
        r = revisions[i]
        rs = template_of[r]
        rs_latest = int((rs.metadata.annotations or {}).get(REVISION_ANNOTATION, r))
        first = first_rev_of_rs.get(rs_latest, r)
        previous = summaries[revisions[i - 1]] if i > 0 else None
        if r == first:
            created = rs.metadata.creation_timestamp
            when = f"created {created.astimezone().strftime('%H:%M:%S')} ({_age(created, now)} ago)"
        else:
            at = activated.get(rs.metadata.name) if r == rs_latest else None
            when = (f"re-applied the template of revision {first} (a rollback, or a change back to an identical template)"
                    + (f" at {at.astimezone().strftime('%H:%M:%S')} ({_age(at, now)} ago)" if at else ""))
        if r != rs_latest:
            when += f"; its template was later re-applied as revision {rs_latest}"
        marker = " (CURRENT)" if r == current else ""
        lines.append(f"- revision {r}{marker}: {when}: {_describe_change(previous, summaries[r])}")
        if len(lines) > 7:
            break
    return "\n".join(lines)


# --- 3. get_kubernetes_logs ---
@tool
def get_kubernetes_logs() -> str:
    """
    Scans the last 200 log lines of every backend pod and returns, for each pod, the number
    of lines scanned and its last 10 warning, error, 5xx or OOM lines. Use it to see what
    the application itself reports about the problem.
    """
    _guard_observed("get_kubernetes_logs")
    deployment_name = ALLOWED_DEPLOYMENT
    namespace = ALLOWED_NAMESPACE
    try:
        get_kube_config()
        v1 = client.CoreV1Api()

        # Same pod selection as get_pod_breakdown. (Until 2026-10-11 the selector was
        # app=aiops-backend-deployment, which matches no pod, so every call fell back to
        # listing all pods of the namespace and filtering by name: same pods, same output.)
        pods = v1.list_namespaced_pod(namespace=namespace, label_selector="app=aiops-backend").items
        matched_pods = [p for p in pods if p.metadata.name.startswith(deployment_name)]

        if not matched_pods:
            return f"No active Pods were found for deployment: {deployment_name}"

        report = []
        for pod in matched_pods:
            pod_name = pod.metadata.name
            logs = v1.read_namespaced_pod_log(name=pod_name, namespace=namespace, tail_lines=200)
            lines = logs.splitlines()
            problems = [
                line for line in lines
                if "[WARN" in line or "[ERROR" in line or "Status: 5" in line
                or "Error" in line or "OOM" in line
            ]
            report.append(f"--- Pod {pod_name}: {len(lines)} lines scanned, {len(problems)} warnings/errors ---")
            report.extend(problems[-10:])
        return "\n".join(report)
    except Exception as e:
        return f"Error retrieving logs: {str(e)}"


# ===== Action tools (4-5): each one is the fix for one kind of cause ============================
# capacity -> scale | bad state in the running processes -> restart (the whole app, rolling).
# Hard-coded target, cooldowns, and every applied action recorded in run_outcome.
# --- 4. scale_kubernetes_deployment ---
@tool
def scale_kubernetes_deployment(replicas: int) -> str:
    """
    Changes only the number of backend pods (scale up or down). New pods start from the
    current pod template; the template and the processes that keep running are not changed.
    Use it when the replica count does not match the traffic: scale up when the load per pod
    is more than the pods can serve within the latency objective, scale down when they are
    over-provisioned. Allowed: 1 to 3 replicas, at most 2 more or fewer than now per call.

    Args:
        replicas: The desired total number of replicas (1 to 3).
    """
    refusal = _guard_refusal()
    if refusal:
        return refusal
    global _last_scale_action_at

    deployment_name = ALLOWED_DEPLOYMENT
    namespace = ALLOWED_NAMESPACE

    if isinstance(replicas, bool) or not isinstance(replicas, int):
        return "Safety violation: replicas must be an integer."
    if not MIN_REPLICAS <= replicas <= MAX_REPLICAS:
        return (
            f"Safety violation: replicas must be between {MIN_REPLICAS} "
            f"and {MAX_REPLICAS}."
        )

    cooldown_error = _cooldown_error(
        "scale", _last_scale_action_at, SCALE_COOLDOWN_SECONDS
    )
    if cooldown_error:
        return cooldown_error

    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()

        current_scale = apps_v1.read_namespaced_deployment_scale(
            name=deployment_name,
            namespace=namespace
        )
        current_replicas = int(current_scale.spec.replicas or 0)
        scale_delta = abs(replicas - current_replicas)

        if scale_delta == 0:
            return f"No-op: deployment is already at {replicas} replicas."
        if scale_delta > MAX_SCALE_DELTA:
            return (
                f"Safety violation: scale delta {scale_delta} exceeds the "
                f"maximum allowed delta of {MAX_SCALE_DELTA}."
            )

        body = {"spec": {"replicas": replicas}}
        apps_v1.patch_namespaced_deployment_scale(
            name=deployment_name,
            namespace=namespace,
            body=body
        )
        _last_scale_action_at = time.monotonic()
        _record_action(f"scale {current_replicas}->{replicas}")
        print(
            f"[SAFETY] scale applied: deployment={deployment_name} "
            f"namespace={namespace} from={current_replicas} to={replicas} "
            f"cooldown={SCALE_COOLDOWN_SECONDS}s"
        )
        return f"✅ Scaling was successful for deployment '{deployment_name}' to {replicas} replicas in namespace '{namespace}'."
    except Exception as e:
        return f"Error during deployment scaling: {str(e)}"


# --- 5. restart_kubernetes_deployment ---
@tool
def restart_kubernetes_deployment() -> str:
    """
    Rolling restart of ALL backend pods: they are replaced one at a time (so the deployment
    keeps serving) by fresh processes from the current pod template (same image, environment
    and resources). It clears bad state held inside the running processes; a problem that
    comes from the pod template itself comes back in the new pods. It appears afterwards as
    a new revision in get_deployment_history().
    """
    refusal = _guard_refusal() or _diagnosis_refusal()
    if refusal:
        return refusal
    global _last_restart_action_at

    deployment_name = ALLOWED_DEPLOYMENT
    namespace = ALLOWED_NAMESPACE

    cooldown_error = _cooldown_error(
        "restart", _last_restart_action_at, RESTART_COOLDOWN_SECONDS
    )
    if cooldown_error:
        return cooldown_error

    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        
        now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now
                        }
                    }
                }
            }
        }
        
        apps_v1.patch_namespaced_deployment(
            name=deployment_name,
            namespace=namespace,
            body=body
        )
        _last_restart_action_at = time.monotonic()
        _record_action("restart")
        print(
            f"[SAFETY] restart applied: deployment={deployment_name} "
            f"namespace={namespace} cooldown={RESTART_COOLDOWN_SECONDS}s"
        )
        return f"✅ Rolling restart triggered for deployment '{deployment_name}'."
    except Exception as e:
        return f"Error triggering restart: {str(e)}"


# ===== Guards: behaviour rules enforced by code during an agent run ==============================
# Each rule exists because the LLM broke it in a measured run while it was only a prompt instruction
# (thesis_notes/design_decisions.md A18, A19):
# 1. Evidence before action: an action tool or a final answer in the same step as an observation tool
#    is refused; the LLM decides in its next step, with the observation output in front of it.
# 2. No claimed action without a tool call: a final answer that is not "No action taken: ..." is
#    refused while no action has been recorded in this run.
# 3. Diagnosis before a disruptive action: a restart (every process is replaced; until phase 2 also a pod
#    restart or a rollback) is refused until all three observation tools were used in the run. Scaling, the
#    capacity path, is not affected.
# Active only between guard_start() and guard_stop(), which agent.py calls around one run.
# guard_start(enforce=False) (AIOPS_ACT_GUARD=off) disables all three, for an ablation.
_guard = {"active": False, "enforce": False, "step": 0, "observed_in": None, "observed": set()}


EVIDENCE_MESSAGE = ("Refused (evidence before action): you called an observation tool in this same step, "
                    "so you have not seen its output yet. Read the output first, then decide in your next step.")
CLAIM_MESSAGE = ("Refused: no action tool was executed in this run, so the cluster has not changed. Either call "
                 "the action tool now (one tool per step), or answer final_answer(\"No action taken: <reason>\").")


DIAGNOSIS_TOOLS = ("get_pod_breakdown", "get_deployment_history", "get_kubernetes_logs")


def guard_start(enforce=True):
    _guard.update(active=True, enforce=bool(enforce), step=0, observed_in=None, observed=set())


def guard_stop():
    _guard["active"] = False


def guard_step_done(*_args, **_kwargs):
    """smolagents step callback: one LLM step (one code block) has finished."""
    _guard["step"] += 1


def _guard_observed(tool_name=None):
    _guard["observed_in"] = _guard["step"]
    if tool_name:
        _guard["observed"].add(tool_name)


def _guard_on():
    return _guard["active"] and _guard["enforce"]


def _guard_refusal():
    if _guard_on() and _guard["observed_in"] == _guard["step"]:
        return EVIDENCE_MESSAGE
    return None


def _diagnosis_refusal():
    if not _guard_on():
        return None
    missing = [t for t in DIAGNOSIS_TOOLS if t not in _guard["observed"]]
    if missing:
        return ("Refused (diagnosis first): a restart is disruptive, so look at all three observation "
                f"tools before it. Still missing: {', '.join(t + '()' for t in missing)}.")
    return None


def guard_final_answer_check(final_answer, memory, agent=None):
    """smolagents final_answer_check: no final answer in the step that observed (it would be a guess)."""
    if _guard_refusal():
        raise ValueError(EVIDENCE_MESSAGE)
    return True


def claim_final_answer_check(final_answer, memory, agent=None):
    """smolagents final_answer_check: a report of an action needs an executed action tool."""
    if _guard_on() and not run_outcome["actions"] and not str(final_answer).strip().lower().startswith("no action"):
        raise ValueError(CLAIM_MESSAGE)
    return True


# ===== Verification (code, after the LLM) =======================================================
# Phase 2 (2026-10-22, the user's design): an action is judged by the trajectory of the health model's score,
# the same One-Class SVM that woke the agent, read every 10 s on the detector's own metrics once the rollout
# has converged. The score is a distance from the healthy region, so its direction has a physical reading:
# rising = the system moves back towards healthy, falling = it moves away. health_model.judge_trajectory:
#   normal twice in a row -> STABLE; anomalous but improving -> wait; worse than before the action, or not
#   improving for 30 s once the 1 m windows hold only post-action data -> UNSTABLE (the detector re-wakes the
#   agent at once); still anomalous after VERIFY_MAX_SECONDS -> UNSTABLE.
# Until phase 2: fixed thresholds on CPU / throttling / p95 over one 40 s window, 50 s after the rollout.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(REPO_ROOT, "5-ml-training", "health_model.pkl")
# A new pod is ready in ~10 s; a pod that never becomes ready again (e.g. the stuck one after a scale-up, whose
# readiness probe keeps failing) would hold a longer wait for nothing, so the trajectory starts after 90 s at most.
VERIFY_ROLLOUT_TIMEOUT = 90
VERIFY_INTERVAL_SECONDS = 10
VERIFY_WINDOW_FULL_SECONDS = 60      # the 1 m rate windows: after this, only post-action data
VERIFY_MAX_SECONDS = 240
VERIFY_MIN_RPS = 1.0                 # = anomaly_detector.MIN_THROUGHPUT_RPS
_bundle = None


def _health_bundle():
    global _bundle
    if _bundle is None:
        _bundle = health_model.load(MODEL_PATH)
    return _bundle


def verify_metrics_stabilization(pre_action_metrics_json: str) -> str:
    """
    Follow the health model's score after an action and record the verdict in run_outcome.

    Called by agent.py after every run that applied an action (not an LLM tool), so an LLM error after the
    action can no longer skip verification. No usable reading at all makes the result UNVERIFIABLE.
    """
    result = _check_stabilization(pre_action_metrics_json)
    # Every result starts with its verdict: "STABLE", "UNSTABLE:" or "UNVERIFIABLE:".
    run_outcome["verification"] = result.split(None, 1)[0].rstrip(":")
    run_outcome["detail"] = result
    return result


def _wait_for_rollout(timeout_seconds):
    """Block until available replicas == desired replicas (or timeout); return seconds waited.
    The ready / desired counts at the end are kept in run_outcome["rollout"] for the report."""
    started = time.monotonic()
    run_outcome["rollout"] = ""
    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        while time.monotonic() - started < timeout_seconds:
            dep = apps_v1.read_namespaced_deployment(name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE)
            desired = dep.spec.replicas or 0
            status = dep.status
            # updated_replicas + observed_generation matter for a restart: the old pod
            # stays "available" until the new one replaces it, so counts alone pass too early.
            run_outcome["rollout"] = f"{status.available_replicas or 0}/{desired} pods ready"
            if ((status.observed_generation or 0) >= (dep.metadata.generation or 0)
                    and (status.updated_replicas or 0) == desired
                    and (status.available_replicas or 0) == desired
                    and (status.replicas or 0) == desired):
                break
            time.sleep(3)
        else:
            run_outcome["rollout"] += f", not converged after {timeout_seconds} s"
    except Exception as e:
        print(f"⚠️ Could not read rollout status: {e}")
    return time.monotonic() - started


def _describe(reading):
    return (f"{reading['replicas']:.0f} pod(s), {reading['throughput']:.1f} rps ({reading['rps_per_pod']:.1f}/pod), "
            f"p95 {reading['latency_p95']:.2f} s, errors {100 * reading['error_rate']:.1f}%")


def _check_stabilization(pre_action_metrics_json):
    """Implementation of verify_metrics_stabilization; returns the report text."""
    try:
        pre = json.loads(pre_action_metrics_json)
        bundle = _health_bundle()
        pre_score = float(pre["score"]) if pre.get("score") is not None else health_model.score(bundle, pre)
    except (TypeError, KeyError, ValueError, OSError) as e:
        return f"UNVERIFIABLE: pre-action reading or model unusable: {e}"

    ready_seconds = _wait_for_rollout(timeout_seconds=VERIFY_ROLLOUT_TIMEOUT)
    print(f"⏳ Rollout converged after {ready_seconds:.0f}s; following the health score every "
          f"{VERIFY_INTERVAL_SECONDS}s (before the action: {pre_score:+.3f})...")
    eps = float(bundle.get("trend_eps", 0.05))
    started = time.monotonic()
    scores, readings, window_full_at, verdict = [], [], None, None
    while True:
        elapsed = time.monotonic() - started
        reading = nfr_metrics.fetch_reading()
        if reading is not None and reading["throughput"] >= VERIFY_MIN_RPS:
            scores.append(health_model.score(bundle, reading))
            readings.append(reading)
            if window_full_at is None and elapsed >= VERIFY_WINDOW_FULL_SECONDS:
                window_full_at = len(scores) - 1
            verdict = health_model.judge_trajectory(
                scores, pre_score, eps, window_full_at if window_full_at is not None else len(scores))
            print(f"   +{elapsed:3.0f}s score {scores[-1]:+.3f} ({_describe(reading)}) -> {verdict}")
            if verdict != "WAIT":
                break
        if elapsed >= VERIFY_MAX_SECONDS:
            verdict = ("UNSTABLE: still anomalous after "
                       f"{VERIFY_MAX_SECONDS // 60} min" if scores else "UNVERIFIABLE: no usable reading")
            break
        time.sleep(VERIFY_INTERVAL_SECONDS)

    if not scores:
        return verdict
    run_outcome["score_after"] = round(scores[-1], 4)
    if verdict == "STABLE":
        run_outcome["recovery_s"] = round(ready_seconds + time.monotonic() - started)
    shown = scores if len(scores) <= 6 else scores[:2] + scores[-4:]
    trajectory = " -> ".join(f"{x:+.2f}" for x in shown)
    first, last = readings[0], readings[-1]
    why = "" if scores[-1] >= 0 else "\nStill outside the healthy range: " + "; ".join(health_model.explain(bundle, last))
    return (f"{verdict}\n"
            f"Health score: before the action {pre_score:+.2f}; after the rollout ({ready_seconds:.0f} s, "
            f"{run_outcome.get('rollout') or '?'}) "
            f"{trajectory} over {len(scores) * VERIFY_INTERVAL_SECONDS} s (>= 0 = healthy)\n"
            f"First reading: {_describe(first)}\nLast reading:  {_describe(last)}{why}")


# ===== Incident memory (code, before and after the LLM) =========================================
# Not LLM tools: the lookup runs before the agent (its result goes into the prompt) and the save runs after the
# verification, both from agent.py. ChromaDB (through the chromadb.aiops ingress) is connected lazily and retried
# on every use: a single attempt at import time once failed silently while ChromaDB was still starting.
# Phase 2 (2026-10-22): every incident is stored with its embedding = the reading in the health model's own space
# (health_model.embedding: log load per pod, p95, errors, replica count, weighted as the model sees them), and the
# lookup is ChromaDB's own nearest-neighbour search in that space, among the STABLE ones. Until then ChromaDB
# computed text embeddings nobody used and the distance was computed by hand on other scales. Failed runs are
# stored too (status "failed"), for the record only: the lookup never returns them, and what failed recently is
# in the prompt's "YOUR RECENT ACTIONS" (agent.py, 15 min). The volume is persistent since 2026-10-22.
COLLECTION = "incidents_nfr"
MEMORY_MATCHES = 2
# Distance in the model's space (Euclidean). 1 = e.g. ~1 std of log load per pod, or p95 x1.28, or 1% errors
# x(err_weight/100); a different pod count is rep_weight away, so in practice only the same count is "similar".
MEMORY_SIMILAR_MAX = 1.5
_collection = None


def _get_collection():
    global _collection
    if _collection is None:
        try:
            chroma_client = chromadb.HttpClient(host='chromadb.aiops', port=80)
            _collection = chroma_client.get_or_create_collection(name=COLLECTION, embedding_function=None)
        except Exception as e:
            print(f"⚠️ ChromaDB connection warning: {e}")
    return _collection


def _drop_collection():
    """Forget the cached handle so the next call reconnects (e.g. ChromaDB restarted)."""
    global _collection
    _collection = None


def query_knowledge_base(metrics: dict) -> str:
    """Return the most similar resolved past incidents (nearest in the health model's space) as prompt text."""
    collection = _get_collection()
    if collection is None:
        return "Incident memory unavailable (ChromaDB unreachable)."
    try:
        embedding = health_model.embedding(_health_bundle(), metrics)
        total = collection.count()
        resolved = len(collection.get(where={"status": "resolved"}, include=[])["ids"]) if total else 0
        if not resolved:
            return f"No verified past incidents yet ({total} stored in total)."
        found = collection.query(query_embeddings=[embedding], n_results=min(MEMORY_MATCHES, resolved),
                                 where={"status": "resolved"}, include=["documents", "metadatas", "distances"])
    except Exception as e:
        _drop_collection()
        return f"Incident memory unavailable (query failed: {e})."

    # ChromaDB's "l2" distance is the squared Euclidean distance.
    matches = [(math.sqrt(max(d, 0.0)), doc, meta) for d, doc, meta in
               zip(found["distances"][0], found["documents"][0], found["metadatas"][0])]
    similar = [m for m in matches if m[0] <= MEMORY_SIMILAR_MAX]
    if not similar:
        # 2026-10-01: a stuck app was shown far-away scale-down incidents under a neutral header, and the agent
        # reused "scale 3->1". Say it plainly, and show only the closest one.
        lines = [f"NO similar past incident: the closest (distance {matches[0][0]:.1f}, >{MEMORY_SIMILAR_MAX:g} = a "
                 "different situation) describes a DIFFERENT problem. Do NOT reuse its action; decide from the "
                 "current metrics. For reference only:"]
        matches = matches[:1]
    else:
        lines = [f"{len(similar)} similar verified past incident(s) of {resolved} stored; most similar first "
                 f"(distance ~0-1 = nearly the same state):"]
        matches = similar
    for distance, doc, meta in matches:
        lines.append(f"  - distance {distance:.1f} | {meta.get('time', '?')} | {doc}\n"
                     f"    Action taken: {meta.get('actions')} -> verified STABLE"
                     f"{' in ' + str(meta.get('recovery_s')) + ' s' if meta.get('recovery_s') not in (None, '') else ''}\n"
                     f"    Diagnosis then: {meta.get('diagnosis')}")
    lines.append("These are hints only: always check them against the current metrics.")
    return "\n".join(lines)


def save_incident(metrics: dict, actions: list, verdict: str, diagnosis: str, agent_version: str) -> str:
    """Store one agent run that applied an action: "resolved" if verified STABLE, "failed" otherwise."""
    collection = _get_collection()
    if collection is None:
        return "Error: ChromaDB is unreachable for storage."
    status = "resolved" if verdict == "STABLE" else "failed"
    try:
        embedding = health_model.embedding(_health_bundle(), metrics)
    except Exception as e:
        return f"Error: no embedding for this reading: {e}"
    explanation = metrics.get("explanation") or []
    document = (f"{_describe(metrics)}; score {metrics.get('score', 0):+.2f}"
                + (f": {'; '.join(explanation)}" if explanation else ""))
    metadata = {
        "status": status, "time": datetime.datetime.now().isoformat(timespec="seconds"), "agent_version": agent_version,
        "replicas": int(round(metrics["replicas"])), "rps": round(float(metrics["throughput"]), 2),
        "rps_per_pod": round(float(metrics["rps_per_pod"]), 2), "p95": round(float(metrics["latency_p95"]), 4),
        "error_rate": round(float(metrics.get("error_rate") or 0.0), 4),
        "score_before": round(float(metrics.get("score") or 0.0), 4),
        "score_after": run_outcome["score_after"] if run_outcome["score_after"] is not None else "",
        "recovery_s": run_outcome["recovery_s"] if run_outcome["recovery_s"] is not None else "",
        "actions": "; ".join(actions), "verdict": run_outcome["detail"].split("\n", 1)[0][:200] or verdict,
        "diagnosis": (diagnosis or "")[:500],
    }
    incident_id = f"incident_{time.time_ns()}"
    try:
        collection.add(ids=[incident_id], embeddings=[embedding], documents=[document], metadatas=[metadata])
    except Exception as e:
        _drop_collection()
        return f"Error: saving to ChromaDB failed: {e}"
    return f"Success: incident saved as {status} with ID {incident_id}."
