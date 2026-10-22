"""
Tools of the AIOps agent and the code around them (final version, agent v8.1 = prompt v8 with the tool
descriptions corrected on 2026-10-11; thesis_notes/design_decisions.md A20).

THE 7 LLM TOOLS: the only things the LLM can call (agent.py passes them to the CodeAgent in this order).
  Observe (read-only):
    1. get_pod_breakdown()            per pod: CPU, throttling, req/s, CPU per request, p95, 5xx, event-loop lag,
                                      memory, restarts, age, revision
    2. get_deployment_history()       recent revisions and what changed in each (image, env, limits, restart)
    3. get_kubernetes_logs()          warning / error / 5xx lines of every pod
  Act (guarded; each one targets only default/aiops-backend-deployment and records what it applied):
    4. scale_kubernetes_deployment(replicas)      capacity: 1-3 replicas, at most +-2 per call, 30 s cooldown
    5. restart_kubernetes_deployment()            bad state in the running processes: rolling restart, 60 s cooldown
    6. restart_kubernetes_pod(pod_name)           one bad pod: delete it (refused if < 2 pods ready), 60 s cooldown
    7. rollback_kubernetes_deployment(revision)   bad change: re-apply an earlier pod template, 60 s cooldown

CODE AROUND THE LLM (not tools, so the LLM can neither skip nor fake them):
  - guards: evidence before action; no claimed action without a tool call; full diagnosis before a
    restart, pod restart or rollback (active only during an agent run)
  - verification of every action (verify_metrics_stabilization), called by agent.py after the run
  - incident memory in ChromaDB: lookup before the run, save after a STABLE verification

Order of this file: configuration, shared helpers, observation tools, action tools, guards, verification,
incident memory. Earlier agent versions (v4-v7) were removed on 2026-10-10: thesis_notes/removed_and_archived.md.
"""
import os
import re
import math
import time
import datetime
import json
import requests
import pandas as pd
# pyrefly: ignore [missing-import]
import chromadb
from smolagents import tool
from kubernetes import client, config


# ===== Configuration ==========================================================================
PROMETHEUS_URL = "http://prometheus.aiops"
ALLOWED_NAMESPACE = "default"
ALLOWED_DEPLOYMENT = "aiops-backend-deployment"
MIN_REPLICAS = 1
MAX_REPLICAS = 3  # Host CPU limit: >3 x 1-core pods saturates the laptop (see "Pod sizing" in CLAUDE.md)
MAX_SCALE_DELTA = 2
SCALE_COOLDOWN_SECONDS = 30
RESTART_COOLDOWN_SECONDS = 60
POD_RESTART_COOLDOWN_SECONDS = 60
ROLLBACK_COOLDOWN_SECONDS = 60


# Median / max CPU cost per request (core-seconds) over baseline_metrics_healthy.csv (rps > 2),
# measured on 2026-09-30 before any fault existed.
HEALTHY_CPU_PER_REQUEST = 0.073
HEALTHY_CPU_PER_REQUEST_MAX = 0.10


REVISION_ANNOTATION = "deployment.kubernetes.io/revision"
HISTORY_ANNOTATION = "deployment.kubernetes.io/revision-history"


# Time of the last action of each kind (cooldowns).
_last_scale_action_at = 0.0
_last_restart_action_at = 0.0
_last_pod_restart_at = 0.0
_last_rollback_at = 0.0


# ===== Shared helpers ===========================================================================
# Ground truth of what happened during one agent run, recorded by the tools
# themselves so that success is judged from facts, not from the LLM's wording.
#   actions:      actions actually applied to the cluster
#   verification: STABLE / UNSTABLE / UNVERIFIABLE for the latest action, or None
run_outcome = {"actions": [], "verification": None}


def reset_run_outcome():
    run_outcome["actions"] = []
    run_outcome["verification"] = None


def _record_action(description):
    run_outcome["actions"].append(description)
    # A new action invalidates any earlier verification.
    run_outcome["verification"] = None


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

    lines = [f"{len(pods)} backend pod(s). Healthy reference (training data, normal login traffic): "
             f"CPU per request ~{HEALTHY_CPU_PER_REQUEST} core-s (max {HEALTHY_CPU_PER_REQUEST_MAX}), "
             "p95 <= 0.2 s, throttling <= 6%. Below ~3 req/s per pod the process's idle CPU inflates CPU per request."]
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


# ===== Action tools (4-7): each one is the fix for one kind of cause ============================
# capacity -> scale | bad state in the running processes -> restart | one bad pod -> restart pod |
# a bad change -> rollback. Hard-coded target, cooldowns, and every applied action recorded in run_outcome.
# --- 4. scale_kubernetes_deployment ---
@tool
def scale_kubernetes_deployment(replicas: int) -> str:
    """
    Changes only the number of backend pods (scale up or down). New pods start from the
    current pod template; the template and the processes that keep running are not changed.
    Use it when the replica count does not match the traffic: scale up when the pods are
    short of CPU, scale down when they are over-provisioned. Allowed: 1 to 3 replicas, at
    most 2 more or fewer than now per call.

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


# --- 6. restart_kubernetes_pod ---
@tool
def restart_kubernetes_pod(pod_name: str) -> str:
    """
    Deletes ONE backend pod; the deployment immediately replaces it with a fresh process from
    the same pod template. The other pods and the deployment itself are not changed (no new
    revision). Use it when a single pod misbehaves while the others are healthy. Refused when
    fewer than 2 pods are ready (deleting the only ready pod would drop traffic): then use
    restart_kubernetes_deployment().

    Args:
        pod_name: The exact pod name, as shown by get_pod_breakdown().
    """
    refusal = _guard_refusal() or _diagnosis_refusal()
    if refusal:
        return refusal
    global _last_pod_restart_at
    if not isinstance(pod_name, str) or not pod_name.startswith(f"{ALLOWED_DEPLOYMENT}-"):
        return f"Safety violation: only pods of deployment '{ALLOWED_DEPLOYMENT}' may be restarted."
    cooldown_error = _cooldown_error("pod restart", _last_pod_restart_at, POD_RESTART_COOLDOWN_SECONDS)
    if cooldown_error:
        return cooldown_error
    try:
        get_kube_config()
        core_v1 = client.CoreV1Api()
        apps_v1 = client.AppsV1Api()
        pods = core_v1.list_namespaced_pod(namespace=ALLOWED_NAMESPACE, label_selector="app=aiops-backend").items
        names = {p.metadata.name for p in pods if not p.metadata.deletion_timestamp}
        if pod_name not in names:
            return f"Pod '{pod_name}' not found. Current pods: {sorted(names)}"
        dep = apps_v1.read_namespaced_deployment(name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE)
        if (dep.status.available_replicas or 0) < 2:
            return ("Refused: fewer than 2 pods are ready, so deleting this one would drop traffic. "
                    "Use restart_kubernetes_deployment() (rolling restart, no downtime) instead.")
        core_v1.delete_namespaced_pod(name=pod_name, namespace=ALLOWED_NAMESPACE)
        _last_pod_restart_at = time.monotonic()
        _record_action(f"restart pod {pod_name}")
        print(f"[SAFETY] pod restart applied: pod={pod_name} cooldown={POD_RESTART_COOLDOWN_SECONDS}s")
        return f"✅ Pod '{pod_name}' deleted; the deployment is creating a replacement."
    except Exception as e:
        return f"Error restarting pod: {e}"


# --- 7. rollback_kubernetes_deployment ---
@tool
def rollback_kubernetes_deployment(revision: int = 0) -> str:
    """
    Rolls the backend deployment back to an earlier revision (like `kubectl rollout undo`):
    the pod template of that revision (image, environment, resources) is re-applied with a
    rolling update. Use it when a recent change to the deployment caused the problem.

    Args:
        revision: Revision number to return to (see get_deployment_history()); 0 = the previous revision.
    """
    refusal = _guard_refusal() or _diagnosis_refusal()
    if refusal:
        return refusal
    global _last_rollback_at
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        return "Safety violation: revision must be a non-negative integer."
    cooldown_error = _cooldown_error("rollback", _last_rollback_at, ROLLBACK_COOLDOWN_SECONDS)
    if cooldown_error:
        return cooldown_error
    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        dep = apps_v1.read_namespaced_deployment(name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE)
        current = int((dep.metadata.annotations or {}).get(REVISION_ANNOTATION, 0))
        by_revision = _owned_replica_sets(apps_v1)
        if revision == 0:
            older = [r for r in by_revision if r < current]
            if not older:
                return "No earlier revision to roll back to."
            revision = max(older)
        if revision == current:
            return f"No-op: revision {revision} is already the current revision."
        if revision not in by_revision:
            return f"Revision {revision} not found. Available: {sorted(by_revision)}"
        template = apps_v1.api_client.sanitize_for_serialization(by_revision[revision].spec.template)
        template.get("metadata", {}).get("labels", {}).pop("pod-template-hash", None)
        # JSON patch "replace" (as kubectl does): a strategic merge would keep env vars
        # that the target revision does not have.
        apps_v1.patch_namespaced_deployment(
            name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE,
            body=[{"op": "replace", "path": "/spec/template", "value": template}],
        )
        _last_rollback_at = time.monotonic()
        _record_action(f"rollback to revision {revision}")
        print(f"[SAFETY] rollback applied: deployment={ALLOWED_DEPLOYMENT} from revision {current} to {revision}")
        return f"✅ Rolling back deployment '{ALLOWED_DEPLOYMENT}' from revision {current} to the template of revision {revision}."
    except Exception as e:
        return f"Error during rollback: {e}"


# ===== Guards: behaviour rules enforced by code during an agent run ==============================
# Each rule exists because the LLM broke it in a measured run while it was only a prompt instruction
# (thesis_notes/design_decisions.md A18, A19):
# 1. Evidence before action: an action tool or a final answer in the same step as an observation tool
#    is refused; the LLM decides in its next step, with the observation output in front of it.
# 2. No claimed action without a tool call: a final answer that is not "No action taken: ..." is
#    refused while no action has been recorded in this run.
# 3. Diagnosis before a disruptive action: a restart, pod restart or rollback (in-flight requests are
#    lost, ~1-3 s of 502 without a readiness probe) is refused until all three observation tools were
#    used in the run. Scaling, the capacity path, is not affected.
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
        return ("Refused (diagnosis first): a restart or rollback is disruptive, so look at all three observation "
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
def verify_metrics_stabilization(pre_action_metrics_json: str) -> str:
    """
    Wait for the system to stabilize, then compare the five operational metrics
    before and after remediation, and record the verdict in run_outcome.

    Called by agent.py after every run that applied an action (not an LLM tool),
    so an LLM error after the action can no longer skip verification.
    Missing Prometheus values make the result UNVERIFIABLE, never zero.
    """
    result = _check_stabilization(pre_action_metrics_json)
    # Every result starts with its verdict: "STABLE", "UNSTABLE" or "UNVERIFIABLE:".
    run_outcome["verification"] = result.split(None, 1)[0].rstrip(":")
    return result


SLO_P95_SECONDS = 0.35
SLO_CPU_PER_POD = 0.75


# Throttling limit for VERIFICATION = the training filter's "healthy" limit (10%,
# train_health_baseline.MAX_CPU_THROTTLING), not the agent's 5% early-warning target:
# one 40 s window right after an action is bursty (e.g. 8 VUs released at once after
# a restart read 6.7% at CPU 0.52), and the healthy training data itself reaches 6.2%.
# Verification must not be stricter than what the detector learned as healthy.
VERIFY_MAX_THROTTLING = 0.10
VERIFY_ROLLOUT_TIMEOUT = 120
VERIFY_SETTLE_SECONDS = 50


# Verification uses 40 s rate windows (30 s sometimes holds <2 cAdvisor samples), not the
# detector's 1 m: after the 50 s settle the window covers ~10-50 s after the action,
# so it holds neither requests from before the action nor the new pod's startup
# burst. (2026-10-01: a restart that fixed the app read p95 3.8 s and throttling 8%
# on 1 m windows: stuck requests from before the restart plus Node's boot.)
VERIFY_WINDOW = "40s"
VERIFY_QUERY_ATTEMPTS = 3
VERIFY_RETRY_SECONDS = 10


def _wait_for_rollout(timeout_seconds):
    """Block until available replicas == desired replicas (or timeout); return seconds waited."""
    started = time.monotonic()
    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        while time.monotonic() - started < timeout_seconds:
            dep = apps_v1.read_namespaced_deployment(name=ALLOWED_DEPLOYMENT, namespace=ALLOWED_NAMESPACE)
            desired = dep.spec.replicas or 0
            status = dep.status
            # updated_replicas + observed_generation matter for a restart: the old pod
            # stays "available" until the new one replaces it, so counts alone pass too early.
            if ((status.observed_generation or 0) >= (dep.metadata.generation or 0)
                    and (status.updated_replicas or 0) == desired
                    and (status.available_replicas or 0) == desired
                    and (status.replicas or 0) == desired):
                break
            time.sleep(3)
    except Exception as e:
        print(f"⚠️ Could not read rollout status: {e}")
    return time.monotonic() - started


def _check_stabilization(pre_action_metrics_json):
    """Implementation of verify_metrics_stabilization; returns the report text."""
    try:
        pre_action_metrics = json.loads(pre_action_metrics_json)
    except (TypeError, json.JSONDecodeError) as e:
        return f"UNVERIFIABLE: invalid pre-action metrics JSON: {e}"

    required_metrics = {
        "throughput",
        "latency_p95",
        "active_replicas",
        "avg_cpu_per_pod",
        "cpu_throttling",
    }
    missing_metrics = sorted(required_metrics - set(pre_action_metrics))
    if missing_metrics:
        return f"UNVERIFIABLE: missing pre-action metric(s): {missing_metrics}"

    # Wait until the deployment has converged, then long enough that the 1-minute
    # rate windows mostly describe the NEW state. (A fixed 20 s wait judged the
    # action mostly on pre-action data, so almost anything passed.)
    ready_seconds = _wait_for_rollout(timeout_seconds=VERIFY_ROLLOUT_TIMEOUT)
    print(f"⏳ Rollout converged after {ready_seconds:.0f}s; waiting {VERIFY_SETTLE_SECONDS}s for metrics to reflect the new state...")
    time.sleep(VERIFY_SETTLE_SECONDS)

    PROMETHEUS_URL = "http://prometheus.aiops"

    w = VERIFY_WINDOW
    queries = {
        "throughput": f'sum(rate(http_requests_total{{app="aiops-backend"}}[{w}]))',
        "latency_p95": f'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{{app="aiops-backend"}}[{w}])) by (le))',
        "active_replicas": 'kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"}',
        "avg_cpu_per_pod": f'sum(rate(container_cpu_usage_seconds_total{{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}}[{w}])) / scalar(kube_deployment_status_replicas_available{{namespace="default", deployment="aiops-backend-deployment"}})',
        "cpu_throttling": f'sum(increase(container_cpu_cfs_throttled_periods_total{{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}}[{w}])) / sum(increase(container_cpu_cfs_periods_total{{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}}[{w}]))',
    }

    results = {}
    for name, query in queries.items():
        # An empty or NaN answer is retried (2026-10-03 bug fix): a 40 s window sometimes holds
        # fewer than 2 cAdvisor samples right after a new pod starts (1 of 74 verifications,
        # after a rollback). UNVERIFIABLE is not harmless: a scale-down judged UNVERIFIABLE is
        # rolled back. So wait for the next scrape before giving up.
        for attempt in range(VERIFY_QUERY_ATTEMPTS):
            if attempt:
                time.sleep(VERIFY_RETRY_SECONDS)
            try:
                response = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={'query': query}, timeout=5)
                response.raise_for_status()
                metrics = response.json().get('data', {}).get('result', [])
            except Exception as e:
                problem = f"UNVERIFIABLE: error fetching {name} from Prometheus: {e}"
                continue
            if not metrics:
                problem = f"UNVERIFIABLE: Prometheus returned no value for {name}."
                continue
            value = float(metrics[0]['value'][1])
            if pd.isna(value):
                problem = f"UNVERIFIABLE: Prometheus returned NaN for {name}."
                continue
            results[name] = round(value, 4)
            break
        else:
            return problem

    pre_throughput = float(pre_action_metrics["throughput"])
    pre_latency = float(pre_action_metrics["latency_p95"])
    pre_cpu = float(pre_action_metrics["avg_cpu_per_pod"])
    pre_throttling = float(pre_action_metrics["cpu_throttling"])

    # CPU and throttling pass if they meet the limit, or (for a state that was already
    # violating it) clearly improved, so a scale-up that relieves pressure passes even
    # while load is still ramping. Latency (what users feel) must meet the SLO: a fault
    # that more pods only dilute (p95 4.4 s -> 3 s) must not be saved as "the fix".
    # (Changed 2026-10-01 17:30; no earlier STABLE verdict relied on the latency
    # improvement clause, checked against every run's controller log.)
    # A scale-down passes only if the smaller deployment really holds the load.
    checks = {
        "availability": results["active_replicas"] >= 1,
        "throughput_preserved": (
            pre_throughput <= 0.0
            or results["throughput"] >= pre_throughput * 0.5
        ),
        "latency_slo": results["latency_p95"] < SLO_P95_SECONDS,
        "cpu_slo": (
            results["avg_cpu_per_pod"] < SLO_CPU_PER_POD
            or results["avg_cpu_per_pod"] < pre_cpu * 0.9
        ),
        "throttling_ok": (
            results["cpu_throttling"] < VERIFY_MAX_THROTTLING
            or results["cpu_throttling"] < pre_throttling * 0.9
        ),
    }
    is_stable = all(checks.values())
    stability = "STABLE" if is_stable else "UNSTABLE"

    return (
        f"{stability}\n"
        f"Checks: {checks}\n"
        f"📊 Pre-Intervention Metrics:\n"
        f"- Throughput: {pre_throughput} req/sec\n"
        f"- P95 Latency: {pre_latency} seconds\n"
        f"- Avg CPU per Pod: {pre_cpu} cores\n"
        f"- CPU Throttling: {round(pre_throttling * 100, 2)}%\n"
        f"📊 Post-Intervention Metrics:\n"
        f"- Throughput: {results.get('throughput')} req/sec\n"
        f"- P95 Latency: {results.get('latency_p95')} seconds\n"
        f"- Active Replicas: {results.get('active_replicas')}\n"
        f"- Avg CPU per Pod: {results.get('avg_cpu_per_pod')} cores\n"
        f"- CPU Throttling: {round(results.get('cpu_throttling', 0) * 100, 2)}%"
    )


# ===== Incident memory (code, before and after the LLM) =========================================
# Not LLM tools: the lookup runs before the agent (its result goes into the prompt) and the save runs
# after a STABLE verification, both from agent.py. ChromaDB (through the chromadb.aiops ingress) is
# connected lazily and retried on every use: a single attempt at import time once failed silently while
# ChromaDB was still starting, which disabled incident memory for a whole run.
# Retrieval is metric-based, not text-embedding-based: on 2026-09-30 embeddings put overload and waste
# states at nearly the same distance (0.03-0.05), so a scale-UP incident came back as the closest match
# for a scale-DOWN state. Now: same replica count only, nearest by scaled distance over log rps, CPU,
# throttling and log p95, stored as metadata with every incident.
_collection = None


def _get_collection():
    global _collection
    if _collection is None:
        try:
            chroma_client = chromadb.HttpClient(host='chromadb.aiops', port=80)
            _collection = chroma_client.get_or_create_collection(name="sre_runbooks")
        except Exception as e:
            print(f"⚠️ ChromaDB connection warning: {e}")
    return _collection


def _drop_collection():
    """Forget the cached handle so the next call reconnects (e.g. ChromaDB restarted)."""
    global _collection
    _collection = None


MEMORY_MATCHES = 2
MEMORY_SIMILAR_MAX = 3.0


def _incident_features(meta):
    """Metrics of a stored incident (metadata written by save_resolution_to_chroma), or None."""
    try:
        return {"replicas": int(meta["replicas"]), "cpu": float(meta["cpu"]), "throttling": float(meta["throttling"]),
                "rps": float(meta["rps"]), "p95": float(meta["p95"])}
    except (KeyError, TypeError, ValueError):
        return None


def _metric_distance(a, b):
    """Scaled Euclidean distance; ~1 = one 'noticeable difference' in total."""
    d = ((a["cpu"] - b["cpu"]) / 0.1) ** 2
    d += ((a["throttling"] - b["throttling"]) / 0.02) ** 2
    d += (math.log(max(a["rps"], 0.1)) - math.log(max(b["rps"], 0.1))) ** 2 / 0.2 ** 2
    d += (math.log(max(a["p95"], 0.05)) - math.log(max(b["p95"], 0.05))) ** 2 / 0.3 ** 2
    return math.sqrt(d)


def query_knowledge_base(metrics: dict) -> str:
    """Return the most similar resolved past incidents (same replica count) as prompt text."""
    collection = _get_collection()
    if collection is None:
        return "Incident memory unavailable (ChromaDB unreachable)."
    try:
        stored = collection.get(where={"status": "resolved"}, include=["documents", "metadatas"])
    except Exception as e:
        _drop_collection()
        return f"Incident memory unavailable (query failed: {e})."

    current = {
        "replicas": int(metrics["active_replicas"]), "cpu": float(metrics["avg_cpu_per_pod"]),
        "throttling": float(metrics["cpu_throttling"]), "rps": float(metrics["throughput"]),
        "p95": float(metrics["latency_p95"]),
    }
    candidates = []
    for doc, meta in zip(stored["documents"], stored["metadatas"]):
        feats = _incident_features(meta)
        if feats and feats["replicas"] == current["replicas"]:
            candidates.append((_metric_distance(current, feats), doc, meta))
    if not candidates:
        return (f"No past incidents at {current['replicas']} replica(s) "
                f"({len(stored['documents'])} stored in total).")

    candidates.sort(key=lambda c: c[0])
    if candidates[0][0] > MEMORY_SIMILAR_MAX:
        # 2026-10-01: a stuck app (p95 4.5 s) was shown scale-down incidents at distance > 9
        # under a neutral header, and the agent reused "scale 3->1". Say it plainly.
        lines = [f"NO similar past incident at {current['replicas']} replica(s): the closest "
                 f"(distance {candidates[0][0]:.1f}, >{MEMORY_SIMILAR_MAX:g} = a different situation) "
                 "describe DIFFERENT problems. Do NOT reuse their actions; decide from the current metrics. "
                 "For reference only:"]
    else:
        lines = [f"{len(candidates)} past incident(s) at {current['replicas']} replica(s); most similar first "
                 "(distance ~0-1 = nearly the same state, >3 = a different situation):"]
    for distance, doc, meta in candidates[:MEMORY_MATCHES]:
        lines.append(
            f"  - distance {distance:.1f} | {doc} | p95 {meta.get('p95', 'n/a')}\n"
            f"    Action taken: {meta.get('action_taken')} (verified STABLE)\n"
            f"    Root cause: {meta.get('root_cause')}"
        )
    lines.append("These are hints only: always check them against the current metrics.")
    return "\n".join(lines)


def save_resolution_to_chroma(anomaly_signature: str, root_cause: str, action_taken: str,
                              metrics: dict = None) -> str:
    """Store a resolved incident. Refuses unless the latest verification is STABLE."""
    if run_outcome["verification"] != "STABLE":
        return (
            "Refused: only resolutions verified as STABLE may be saved "
            f"(current verification: {run_outcome['verification']})."
        )
    collection = _get_collection()
    if collection is None:
        return "Error: ChromaDB is unreachable for storage."

    incident_id = f"incident_{int(time.time())}"
    metadata = {"action_taken": action_taken, "root_cause": root_cause, "status": "resolved"}
    if metrics is not None:
        metadata.update({
            "replicas": int(metrics["active_replicas"]), "cpu": round(float(metrics["avg_cpu_per_pod"]), 4),
            "throttling": round(float(metrics["cpu_throttling"]), 4), "rps": round(float(metrics["throughput"]), 3),
            "p95": round(float(metrics["latency_p95"]), 4),
        })
    try:
        collection.add(
            documents=[anomaly_signature],
            metadatas=[metadata],
            ids=[incident_id]
        )
    except Exception as e:
        _drop_collection()
        return f"Error: saving to ChromaDB failed: {e}"

    return f"Success: Incident saved with ID {incident_id}."
