import os
import json
import chromadb

# 1. Αρχικοποίηση της ChromaDB
print("⏳ Αρχικοποίηση της Vector Database...")
client = chromadb.PersistentClient(path="./agent_memory")

# Διαγράφουμε την παλιά αν υπάρχει για να είμαστε καθαροί
try:
    client.delete_collection("opseval_real_data")
except:
    pass

collection = client.create_collection(name="opseval_real_data")

# 2. Η διαδρομή που κατέβηκε το Git repository
repo_path = "./OpsEval-Datasets"
documents = []
metadatas = []
ids = []

print(f"🔍 Σάρωση του φακέλου {repo_path} για πραγματικά JSON δεδομένα...")

count = 0
# Περνάμε μέσα από όλους τους υποφακέλους του OpsEval
for root, dirs, files in os.walk(repo_path):
    for file in files:
        # Ψάχνουμε μόνο τα JSON/JSONL αρχεία (και ιδανικά αποφεύγουμε τα κινέζικα 'zh' αν μπορούμε, αλλά τα παίρνουμε όλα για όγκο)
        if file.endswith(".json") or file.endswith(".jsonl"):
            file_path = os.path.join(root, file)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    # Αν είναι κανονικό JSON
                    data = json.load(f)
                    items = data if isinstance(data, list) else [data]
                except json.JSONDecodeError:
                    # Αν είναι JSONL (μία γραμμή = ένα JSON)
                    f.seek(0)
                    items = [json.loads(line) for line in f if line.strip()]
                
                # Τραβάμε τα πεδία!
                for item in items:
                    # Στο OpsEval τα συμπτώματα είναι συνήθως στο 'input' ή 'instruction'
                    question = item.get("input", item.get("instruction", item.get("question", "")))
                    # Η λύση/αιτία είναι στο 'output' ή 'answer'
                    answer = item.get("output", item.get("answer", ""))
                    
                    if question and answer and len(str(question)) > 10:
                        documents.append(str(question))
                        metadatas.append({"resolution": str(answer), "source_file": file})
                        ids.append(f"real-ops-{count}")
                        count += 1

# 3. Αποθήκευση στη Βάση!
if count > 0:
    print(f"📥 Βρέθηκαν {count} πραγματικά IT Incidents! Μετατροπή σε Embeddings (Αυτό μπορεί να πάρει 1-2 λεπτά)...")
    
    # Τα βάζουμε σε "πακέτα" των 5000 για να μην "σκάσει" η μνήμη του Mac σου
    batch_size = 5000
    for i in range(0, len(documents), batch_size):
        collection.add(
            documents=documents[i:i+batch_size],
            metadatas=metadatas[i:i+batch_size],
            ids=ids[i:i+batch_size]
        )
    print("✅ ΕΠΙΤΥΧΙΑ! Η μνήμη του AIOps Agent είναι πλέον γεμάτη με ΠΡΑΓΜΑΤΙΚΑ ΔΕΔΟΜΕΝΑ.")
else:
    print("❌ Δεν βρέθηκαν δεδομένα. Σιγουρέψου ότι το 'git clone' πέτυχε και ο φάκελος υπάρχει.")