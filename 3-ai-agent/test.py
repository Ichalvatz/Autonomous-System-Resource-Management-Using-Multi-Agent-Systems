import requests
import chromadb

# ==========================================
# 1. API Configuration (The "Brain" - Ariadne)
# ==========================================
API_TOKEN = "sk-proj-101e32df1e1ad0bddd58424e2bb894a7115a8cbd33b89a2523a6dc6d98464dae"
BASE_URL = "https://ariadne.issel.ee.auth.gr/api"
MODEL_ID = "Qwen/Qwen3.6-35B-A3B"

# ==========================================
# 2. Connect to Memory (ChromaDB)
# ==========================================
print("🧠 Connecting to historical incidents database (ChromaDB)...")
client = chromadb.PersistentClient(path="./agent_memory")
collection = client.get_collection(name="rca_kubernetes_memory")

# ==========================================
# 3. Simulate Live Incident (Metrics + LOG)
# ==========================================
# Instead of just metrics, we now include the actual error log from the cluster
live_cpu = 99
live_memory = 20
live_latency = 1000
live_pods = 2
live_log_error = "error"

live_state_text = f"CPU: {live_cpu}%, Memory: {live_memory}%, Latency: {live_latency}ms, Active Pods: {live_pods}\nLatest Error (Log): {live_log_error}"
print(f"\n🚨 NEW ALERT:\n{live_state_text}")

# ==========================================
# 4. RAG - Similarity Search (Using the LOG)
# ==========================================
print(f"\n🔍 Searching history using log signature: '{live_log_error[:50]}...'")

results = collection.query(
    query_texts=[live_log_error],
    n_results=1,
    include=["documents", "metadatas", "distances"] # Requesting documents, metadata, AND distance
)

distance = results['distances'][0][0]

# ==========================================
# 5. Distance Threshold Logic (The AI Filter)
# ==========================================
# If the distance is low (< 1.2), we found a true historical match
if distance < 1.2:
    historical_context = results['documents'][0][0]
    historical_resolution = results['metadatas'][0][0]['resolution']
    
    print(f"✅ Reliable History Found! (Distance Score: {distance:.2f})")
    print(f"📖 Historical Symptom: {historical_context}")
    print(f"💊 Predefined SRE Solution: {historical_resolution}")
    
    rag_prompt_section = f"""
🧠 **Relevant History & Predefined Solution (Runbook):**
A similar incident was found in the past: {historical_context}
The official solution (Runbook) for this is: {historical_resolution}
    """
else:
    print(f"⚠️ IGNORED: The best match was irrelevant (Distance Score: {distance:.2f}).")
    rag_prompt_section = "⚠️ **History:** No relevant incident found in memory. You must rely entirely on current metrics and logs to diagnose."

# ==========================================
# 6. Build Prompt & Communicate with LLM (Qwen)
# ==========================================
system_prompt = (
    "You are a top-tier AIOps Agent for Kubernetes systems. "
    "Your job is to analyze metrics and logs, consult the incident history (if any), "
    "and provide a diagnosis. If a predefined solution (Runbook) is provided, follow it strictly. "
    "Write in a concise, professional DevOps tone. Tell also if the historical solution is applicable or if the situation seems different. "
)

user_prompt = f"""
⚠️ **Current Live State (New Incident):**
{live_state_text}

{rag_prompt_section}

❓ **Query:** Based on the information above, what is your diagnosis for the current issue, and what exact actions (commands) do you recommend?
"""

print("\n🤖 Sending data to LLM (Qwen) for Reasoning...")

payload = {
    "provider": "custom",
    "model": MODEL_ID,
    "system": system_prompt,
    "message": user_prompt
}

headers = {"Authorization": f"Bearer {API_TOKEN}"}
response = requests.post(f"{BASE_URL}/v1/chat", headers=headers, json=payload)

# ==========================================
# 7. The Agent's Decision!
# ==========================================
if response.status_code == 200:
    agent_decision = response.json()['content'][0]['text']
    print("\n=========================================")
    print("🎯 AGENT DECISION (RAG REASONING)")
    print("=========================================")
    print(agent_decision)
    print("=========================================")
else:
    print(f"\n❌ Communication Error: {response.status_code} - {response.text}")