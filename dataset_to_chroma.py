import pandas as pd
import chromadb
import os

print("🚀 Starting Textification & Memory Storage process...\n")

# ==========================================
# Function to give "meaning" to numbers (Smart Textification)
# ==========================================
def get_semantic_signature(cpu, memory, latency):
    cpu_state = "High CPU Load" if cpu > 85 else "Low CPU Load"
    mem_state = "High Memory Usage" if memory > 85 else "Normal Memory"
    lat_state = "Extreme Network Delay" if latency > 2000 else "Normal Latency"
    return f"Symptoms: {cpu_state}, {mem_state}, {lat_state}"

# 1. Initialize ChromaDB (Creates a local 'agent_memory' folder)
client = chromadb.PersistentClient(path="./agent_memory")

# Create a collection (like an SQL table) for our incidents
# If it already exists, reset it for clean testing
try:
    client.delete_collection(name="aiops_knowledge_base")
except Exception as e:
    pass

collection = client.create_collection(name="aiops_knowledge_base")

# 2. Read the CSV
df = pd.read_csv("dataset_sample.csv")

# Lists for batch inserting into ChromaDB
documents = [] # The text (Textification)
metadatas = [] # Extra info (e.g., incident type)
ids = []       # Unique ID for each row

# 3. The Magic of Smart Textification
for index, row in df.iterrows():
    # Ignore "Normal" instances. Our memory only cares about solving problems!
    if row['Root_Cause'] == 'Normal':
        continue
    
    # 1. Create the English signature ONLY for searching
    signature = get_semantic_signature(row['CPU_Usage'], row['Memory_Usage'], row['Latency_ms'])
    
    # 2. Create the text that the Agent (Qwen) will read
    text_memory = (
        f"Historical Incident: {signature}. "
        f"Metrics: CPU {row['CPU_Usage']}%, Memory {row['Memory_Usage']}%, Latency {row['Latency_ms']}ms. "
        f"Root Cause: '{row['Root_Cause']}'."
    )
    
    documents.append(text_memory)
    metadatas.append({"cause": row['Root_Cause']})
    ids.append(f"incident_{index}")
    
    print(f"📝 Memory created: {text_memory}")

# 4. Save to ChromaDB (Embeddings are generated automatically here!)
if documents:
    collection.add(
        documents=documents,
        metadatas=metadatas,
        ids=ids
    )
    print(f"\n✅ Successfully stored {len(documents)} incident records in ChromaDB!")
else:
    print("\n⚠️ No incidents found for storage.")