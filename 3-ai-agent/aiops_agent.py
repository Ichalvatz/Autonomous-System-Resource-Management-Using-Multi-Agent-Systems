import os
from smolagents import CodeAgent, LiteLLMModel
from agent_tools import query_knowledge_base, get_kubernetes_logs, scale_kubernetes_deployment, save_resolution_to_chroma
# Setting up API Key from Google AI Studio
os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY")

# Initialize free Gemini 2.5 Flash via LiteLLM
model = LiteLLMModel(model_id="gemini/gemini-2.5-flash")

# Create SRE Agent with our 3 tools
sre_agent = CodeAgent(
    tools=[query_knowledge_base, get_kubernetes_logs, scale_kubernetes_deployment, save_resolution_to_chroma],
    model=model,
    add_base_tools=True
)

def trigger_ai_agent(metrics_json):
    """
    Function called from anomaly_detector.py when an anomaly is detected.
    """
    prompt = f"""
    [ALERT - AIOPS TRIGGER]
    Current Metrics (JSON): {metrics_json}
    
    Execution Protocol:
    1. Create a standardized string 'anomaly_signature' from the metrics (e.g., "CPU: X, Throughput: Y, Replicas: Z").
    2. Execute 'query_knowledge_base' using this exact signature.
    3. If a match is found, apply the suggested action. If not, analyze logs and determine the action (e.g., scale up).
    4. Apply the corrective action using 'scale_kubernetes_deployment'. 
    5. CRITICAL: Once the action is applied successfully, execute 'save_resolution_to_chroma' using the EXACT SAME 'anomaly_signature' from step 1, the root cause, and the exact action string.
    """
    
    print("\n🤖 [AIOps Agent] Agent woke up! Starting incident analysis...\n")
    response = sre_agent.run(prompt)
    print("\n🏁 [AIOps Agent] Process completed.")
    return response

if __name__ == "__main__":
    # Test run with sample incident
    sample_metrics = '{"cpu_usage": 0.5755, "memory_usage": 155213824.0, "throughput": 1881.48, "latency_p95": 0.0475, "error_rate": 0.0, "active_replicas": 1.0}'
    trigger_ai_agent(sample_metrics)
