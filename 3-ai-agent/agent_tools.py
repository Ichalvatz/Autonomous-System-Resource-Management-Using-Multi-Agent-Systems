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

PROMETHEUS_URL = "http://prometheus.aiops"
ALLOWED_NAMESPACE = "default"
ALLOWED_DEPLOYMENT = "aiops-backend-deployment"
MIN_REPLICAS = 1
MAX_REPLICAS = 3  # Host CPU limit: >3 x 1-core pods saturates the laptop (see "Pod sizing" in CLAUDE.md)
MAX_SCALE_DELTA = 2
SCALE_COOLDOWN_SECONDS = 30
RESTART_COOLDOWN_SECONDS = 60

_last_scale_action_at = 0.0
_last_restart_action_at = 0.0

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

# ChromaDB (through the chromadb.aiops ingress). Connected lazily and retried on
# every use: a single attempt at import time failed silently when ChromaDB was
# still starting, which disabled incident memory for the whole run.
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


def get_kube_config():
    """Dynamically loads the correct Kubernetes configuration."""
    try:
        config.load_incluster_config()
    except config.ConfigException:
        config.load_kube_config()


def _validate_target(deployment_name, namespace):
    if namespace != ALLOWED_NAMESPACE or deployment_name != ALLOWED_DEPLOYMENT:
        return (
            f"Safety violation: only deployment '{ALLOWED_DEPLOYMENT}' "
            f"in namespace '{ALLOWED_NAMESPACE}' may be modified."
        )
    return None


def _cooldown_error(action_name, last_action_at, cooldown_seconds):
    elapsed = time.monotonic() - last_action_at
    remaining = cooldown_seconds - elapsed
    if remaining > 0:
        return f"Safety cooldown: {action_name} blocked for {remaining:.0f}s."
    return None


@tool
def restart_kubernetes_deployment() -> str:
    """
    Triggers a rolling restart of the backend Kubernetes deployment. 
    Use this if pods are stuck, throwing continuous 5xx errors, or experiencing memory leaks that scaling cannot fix.
    """
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
    
# --- Incident memory ---------------------------------------------------------
# Not LLM tools: the lookup runs before the agent (its result goes into the
# prompt) and the save runs after verification, both from agent.py. The LLM
# only decides and acts, so every LLM call it would have spent here is one
# fewer chance of a 429/503 in the middle of an incident.

# Retrieval is metric-based, not text-embedding-based: the signature is mostly
# numbers, and on 2026-09-30 embeddings put overload and waste states at nearly
# the same distance (0.03-0.05), so a scale-UP incident came back as the "closest"
# match for a scale-DOWN state. Now: same replica count only, nearest by scaled
# metric distance (log rps, CPU, throttling, p95 when stored).
_SIGNATURE_RE = re.compile(
    r"CPU:([\d.]+)cores \| Throttle:([\d.]+)% \| Tput:([\d.]+)rps \| Reps:(\d+)"
)
_SIGNATURE_P95_RE = re.compile(r"P95:([\d.]+)s")
MEMORY_MATCHES = 2
MEMORY_SIMILAR_MAX = 3.0


def _incident_features(document, meta):
    """Metrics of a stored incident: from metadata, or parsed from the signature (older entries)."""
    if "replicas" in meta:
        return {
            "replicas": int(meta["replicas"]), "cpu": float(meta["cpu"]),
            "throttling": float(meta["throttling"]), "rps": float(meta["rps"]),
            "p95": float(meta["p95"]) if "p95" in meta else None,
        }
    match = _SIGNATURE_RE.search(document or "")
    if not match:
        return None
    cpu, throttle_pct, rps, reps = match.groups()
    p95 = _SIGNATURE_P95_RE.search(document)
    return {"replicas": int(reps), "cpu": float(cpu), "throttling": float(throttle_pct) / 100,
            "rps": float(rps), "p95": float(p95.group(1)) if p95 else None}


def _metric_distance(a, b):
    """Scaled Euclidean distance; ~1 = one 'noticeable difference' in total."""
    d = ((a["cpu"] - b["cpu"]) / 0.1) ** 2
    d += ((a["throttling"] - b["throttling"]) / 0.02) ** 2
    d += (math.log(max(a["rps"], 0.1)) - math.log(max(b["rps"], 0.1))) ** 2 / 0.2 ** 2
    if a.get("p95") is not None and b.get("p95") is not None:
        d += (math.log(max(a["p95"], 0.05)) - math.log(max(b["p95"], 0.05))) ** 2 / 0.3 ** 2
    elif max(a.get("p95") or 0, b.get("p95") or 0) > SLO_P95_SECONDS:
        # One side breaks the latency SLO and the other's latency is unknown (entries
        # saved before p95 was stored): they cannot be called similar. Seen 2026-10-01:
        # a stuck app (p95 4.5 s) matched old overload incidents at distance < 1.
        d += 3.0 ** 2
    return math.sqrt(d)


def query_knowledge_base(anomaly_signature: str, metrics: dict = None) -> str:
    """Return the most similar resolved past incidents (same replica count) as prompt text."""
    collection = _get_collection()
    if collection is None:
        return "Incident memory unavailable (ChromaDB unreachable)."
    try:
        stored = collection.get(where={"status": "resolved"}, include=["documents", "metadatas"])
    except Exception as e:
        _drop_collection()
        return f"Incident memory unavailable (query failed: {e})."

    if metrics is not None:
        current = {
            "replicas": int(metrics["active_replicas"]), "cpu": float(metrics["avg_cpu_per_pod"]),
            "throttling": float(metrics["cpu_throttling"]), "rps": float(metrics["throughput"]),
            "p95": float(metrics["latency_p95"]),
        }
    else:
        current = _incident_features(anomaly_signature, {})
    if current is None:
        return "Incident memory unavailable (could not read the current metrics)."

    candidates = []
    for doc, meta in zip(stored["documents"], stored["metadatas"]):
        feats = _incident_features(doc, meta)
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

@tool
def get_kubernetes_logs() -> str:
    """
    Scans the recent logs of all backend Pods and returns only warnings, errors and
    5xx responses (plus a count of lines scanned). Only useful when the metrics
    suggest application errors or a frozen app; overload is visible in the metrics alone.
    """
    deployment_name = ALLOWED_DEPLOYMENT
    namespace = ALLOWED_NAMESPACE
    try:
        get_kube_config()
        v1 = client.CoreV1Api()

        selector = f"app={deployment_name}"
        pods = v1.list_namespaced_pod(namespace=namespace, label_selector=selector)

        if not pods.items:
            pods = v1.list_namespaced_pod(namespace=namespace)
            matched_pods = [p for p in pods.items if p.metadata.name.startswith(deployment_name)]
        else:
            matched_pods = pods.items

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

@tool
def scale_kubernetes_deployment(replicas: int) -> str:
    """
    Changes the number of replicas (scale up/down) of the backend Kubernetes deployment.
    Use it to handle traffic spikes or increased latency by scaling up the pods.

    Args:
        replicas: The desired number of replicas (for example, 3).
    """
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
        try:
            response = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={'query': query}, timeout=5)
            response.raise_for_status()
            data = response.json()
            metrics = data.get('data', {}).get('result', [])

            if metrics and len(metrics) > 0:
                value = float(metrics[0]['value'][1])
                if pd.isna(value):
                    return f"UNVERIFIABLE: Prometheus returned NaN for {name}."
                results[name] = round(value, 4)
            else:
                return f"UNVERIFIABLE: Prometheus returned no value for {name}."
        except Exception as e:
            return f"UNVERIFIABLE: error fetching {name} from Prometheus: {e}"

    pre_throughput = float(pre_action_metrics["throughput"])
    pre_latency = float(pre_action_metrics["latency_p95"])
    pre_cpu = float(pre_action_metrics["avg_cpu_per_pod"])
    pre_throttling = float(pre_action_metrics["cpu_throttling"])

    # Each check passes if the metric meets the agent's SLO, or (for a state that
    # was already violating it) has clearly improved. So a scale-up that relieves
    # pressure passes even while load is still ramping, and a scale-down passes
    # only if the smaller deployment really holds the load.
    checks = {
        "availability": results["active_replicas"] >= 1,
        "throughput_preserved": (
            pre_throughput <= 0.0
            or results["throughput"] >= pre_throughput * 0.5
        ),
        "latency_slo": (
            results["latency_p95"] < SLO_P95_SECONDS
            or results["latency_p95"] < pre_latency * 0.9
        ),
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