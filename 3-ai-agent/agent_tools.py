import os
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
MAX_REPLICAS = 6
MAX_SCALE_DELTA = 2
SCALE_COOLDOWN_SECONDS = 30
RESTART_COOLDOWN_SECONDS = 60

_last_scale_action_at = 0.0
_last_restart_action_at = 0.0

# Connect to ChromaDB (it runs on localhost:8000 through port-forward or ingress)
try:
    chroma_client = chromadb.HttpClient(host='chromadb.aiops', port=80)
    collection = chroma_client.get_or_create_collection(name="sre_runbooks")
except Exception as e:
    print(f"⚠️ ChromaDB connection warning: {e}")
    collection = None


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

    import datetime
    try:
        get_kube_config()
        apps_v1 = client.AppsV1Api()
        
        now = datetime.datetime.utcnow().isoformat("T") + "Z"
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
        print(
            f"[SAFETY] restart applied: deployment={deployment_name} "
            f"namespace={namespace} cooldown={RESTART_COOLDOWN_SECONDS}s"
        )
        return f"✅ Rolling restart triggered for deployment '{deployment_name}'."
    except Exception as e:
        return f"Error triggering restart: {str(e)}"
    
@tool
def query_knowledge_base(anomaly_signature: str) -> str:
    """
    Queries the knowledge base for similar resolved incidents using a semantic signature.
    Execute this first when receiving a new anomaly.

    Args:
        anomaly_signature: The standardized semantic description of the anomaly metrics.
    """
    if not collection:
        return "Error: ChromaDB is unreachable."

    results = collection.query(
        query_texts=[anomaly_signature],
        n_results=1,
        where={"status": "resolved"}
    )

    if results and results['documents'] and len(results['documents'][0]) > 0:
        doc = results['documents'][0][0]
        meta = results['metadatas'][0][0]
        return f"Match found.\nSignature: {doc}\nAction: {meta.get('action_taken')}\nRoot Cause: {meta.get('root_cause')}"

    return "No similar incident found. Proceed with manual analysis."

@tool
def save_resolution_to_chroma(anomaly_signature: str, root_cause: str, action_taken: str) -> str:
    """
    Saves a successful incident resolution to the database.
    Execute this only after verifying that the applied action resolved the anomaly.

    Args:
        anomaly_signature: The exact semantic description of the anomaly metrics used during the query phase.
        root_cause: The identified cause of the incident.
        action_taken: The exact action taken to resolve the issue.
    """
    if not collection:
        return "Error: ChromaDB is unreachable for storage."

    incident_id = f"incident_{int(time.time())}"

    collection.add(
        documents=[anomaly_signature],
        metadatas=[{
            "action_taken": action_taken,
            "root_cause": root_cause,
            "status": "resolved"
        }],
        ids=[incident_id]
    )

    return f"Success: Incident saved with ID {incident_id}."

@tool
def get_kubernetes_logs() -> str:
    """
    Retrieves the last 15 lines of logs from the Pods of the backend Kubernetes deployment.
    Use it to check if there are errors such as 5xx responses or OutOfMemory events.
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

        pod_name = matched_pods[0].metadata.name
        logs = v1.read_namespaced_pod_log(name=pod_name, namespace=namespace, tail_lines=15)
        return f"--- Logs from Pod {pod_name} ---\n{logs}"
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
        print(
            f"[SAFETY] scale applied: deployment={deployment_name} "
            f"namespace={namespace} from={current_replicas} to={replicas} "
            f"cooldown={SCALE_COOLDOWN_SECONDS}s"
        )
        return f"✅ Scaling was successful for deployment '{deployment_name}' to {replicas} replicas in namespace '{namespace}'."
    except Exception as e:
        return f"Error during deployment scaling: {str(e)}"

@tool
def verify_metrics_stabilization(pre_action_metrics_json: str) -> str:
    """
    Pause execution to allow the system to stabilize, then compare the five
    operational metrics before and after remediation.

    The verification checks service continuity, throughput preservation, latency,
    CPU pressure, and throttling. Missing Prometheus values make the result
    unverifiable instead of being interpreted as zero.

    Args:
        pre_action_metrics_json: JSON string containing the metrics captured
            immediately before the remediation.
    """
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

    wait_time_seconds = 20
    print(f"⏳ Waiting {wait_time_seconds} seconds for metrics to stabilize...")
    time.sleep(wait_time_seconds)

    PROMETHEUS_URL = "http://prometheus.aiops"

    queries = {
        "throughput": 'sum(rate(http_requests_total{app="aiops-backend"}[1m]))',
        "latency_p95": 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))',
        "active_replicas": 'kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"}',
        "avg_cpu_per_pod": 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / scalar(kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"})',
        "cpu_throttling": 'sum(increase(container_cpu_cfs_throttled_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / sum(increase(container_cpu_cfs_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))'
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

    checks = {
        "availability": results["active_replicas"] >= 1,
        "throughput_preserved": (
            pre_throughput <= 0.0
            or results["throughput"] >= pre_throughput * 0.5
        ),
        "latency_healthy": (
            results["latency_p95"] < 1.5
            or (pre_latency > 0.0 and results["latency_p95"] < pre_latency)
        ),
        "cpu_not_severely_degraded": (
            pre_cpu <= 0.0 or results["avg_cpu_per_pod"] <= max(pre_cpu * 2, 1.0)
        ),
        "throttling_not_severely_degraded": (
            results["cpu_throttling"] <= max(pre_throttling * 2, 0.20)
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