import os
import chromadb
from smolagents import tool
from kubernetes import client, config

# Σύνδεση με ChromaDB (τρέχει στο localhost:8000 μέσω port-forward ή ingress)
try:
    chroma_client = chromadb.HttpClient(host='chromadb.aiops', port=80)
    collection = chroma_client.get_or_create_collection(name="sre_runbooks")
except Exception as e:
    print(f"⚠️ Προειδοποίηση σύνδεσης ChromaDB: {e}")
    collection = None

@tool
def query_knowledge_base(anomaly_signature: str) -> str:
    """
    Queries the knowledge base for similar resolved incidents using a semantic signature.
    Execute this first when receiving a new anomaly.

    Args:
        anomaly_signature: The standardized semantic description of the anomaly metrics (e.g., "CPU: 0.60, Throughput: 2000 RPS, Replicas: 1").
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
    Execute this only after verifying the applied action resolved the anomaly.

    Args:
        anomaly_signature: The exact semantic description of the anomaly metrics used during the query phase.
        root_cause: The identified cause of the incident.
        action_taken: The exact command used to resolve the issue.
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
def get_kubernetes_logs(deployment_name: str, namespace: str = "default") -> str:
    """
    Retrieves the last 50 lines of logs from the Pods of a specific Kubernetes Deployment.
    Use it to check if there are errors (e.g., 5xx, OutOfMemory) in the Pods.

    Args:
        deployment_name: The name of the deployment (e.g., 'aiops-backend-deployment').
        namespace: The namespace of the deployment. Default is 'default'.
    """
    try:
        config.load_kube_config()  # Διαβάζει το ~/.kube/config του Mac σου
        v1 = client.CoreV1Api()
        apps_v1 = client.AppsV1Api()
        
        # Εύρεση των pods που ανήκουν στο deployment
        selector = f"app={deployment_name}"  # Ή το κατάλληλο label selector σου
        pods = v1.list_namespaced_pod(namespace=namespace, label_selector=selector)
        
        if not pods.items:
            # Δοκιμή χωρίς label selector, ψάχνοντας με βάση το όνομα
            pods = v1.list_namespaced_pod(namespace=namespace)
            matched_pods = [p for p in pods.items if p.metadata.name.startswith(deployment_name)]
        else:
            matched_pods = pods.items

        if not matched_pods:
            return f"Δεν βρέθηκαν ενεργά Pods για το deployment: {deployment_name}"
        
        # Παίρνουμε τα logs από το πρώτο pod
        pod_name = matched_pods[0].metadata.name
        logs = v1.read_namespaced_pod_log(name=pod_name, namespace=namespace, tail_lines=50)
        return f"--- Logs από το Pod {pod_name} ---\n{logs}"
    except Exception as e:
        return f"Σφάλμα κατά την ανάκτηση των logs: {str(e)}"

@tool
def scale_kubernetes_deployment(deployment_name: str, replicas: int, namespace: str = "default") -> str:
    """
    Changes the number of replicas (scale up/down) of a specific Kubernetes Deployment.
    Use it to handle traffic spikes or increased latency by scaling up the Pods.

    Args:
        deployment_name: The name of the deployment to scale.
        replicas: The desired number of replicas (e.g., 3).
        namespace: The namespace of the deployment. Default is 'default'.
    """
    try:
        config.load_kube_config()
        apps_v1 = client.AppsV1Api()
        
        # Δημιουργία του scale object
        body = {"spec": {"replicas": replicas}}
        apps_v1.patch_namespaced_deployment_scale(
            name=deployment_name,
            namespace=namespace,
            body=body
        )
        return f"✅ Επιτυχές scaling του deployment '{deployment_name}' σε {replicas} replicas στο namespace '{namespace}'."
    except Exception as e:
        return f"Σφάλμα κατά το scaling του deployment: {str(e)}"
