import os
import pandas as pd
import chromadb

# ==========================================
# 1. Τα SRE Runbooks (Αυτά πάνε στα Metadata!)
# ==========================================
RUNBOOKS = {
    "cpu": {
        "diagnosis": "CPU Throttling / Resource Exhaustion",
        "resolution": "kubectl scale deployment {service} --replicas=+2"
    },
    "mem": {
        "diagnosis": "Memory Leak (Potential OOMKilled)",
        "resolution": "kubectl rollout restart deployment {service}"
    },
    "disk": {
        "diagnosis": "Disk Space Exhaustion / High I/O",
        "resolution": "Clear temporary logs in {service} & Expand PVC."
    },
    "delay": {
        "diagnosis": "High Network Latency / Delay",
        "resolution": "Check Service Mesh routing rules & Increase timeouts."
    },
    "loss": {
        "diagnosis": "Network Packet Loss",
        "resolution": "Verify CNI plugin health & Restart {service} pods."
    },
    "socket": {
        "diagnosis": "TCP Socket Exhaustion",
        "resolution": "Check open ports & Increase connection pool size."
    }
}

BASE_DIR = "./" 

print("🧠 Αρχικοποίηση ChromaDB...")
client = chromadb.PersistentClient(path="./agent_memory")
try: client.delete_collection("rca_kubernetes_memory")
except: pass
collection = client.create_collection(name="rca_kubernetes_memory")

documents = []
metadatas = []
ids = []

print("🔍 Χτίσιμο του Structured RAG (Metrics + Logs)...")

for root, dirs, files in os.walk(BASE_DIR):
    if "logs.csv" in files:
        path_parts = root.split(os.sep)
        fault_folder = path_parts[-2] 
        
        if "_" in fault_folder:
            service_name, fault_type = fault_folder.split("_", 1)
        else:
            continue

        if fault_type in RUNBOOKS:
            try:
                # --- ΒΗΜΑ 1: Εξαγωγή του LOG ---
                logs_path = os.path.join(root, "logs.csv")
                df_logs = pd.read_csv(logs_path, nrows=50) 
                
                log_col = 'message' if 'message' in df_logs.columns else df_logs.columns[-1]
                symptoms = " | ".join(df_logs[log_col].dropna().astype(str).head(3).tolist())
                
                if not symptoms.strip():
                    symptoms = "No explicit error logs captured."

                # --- ΒΗΜΑ 2: Χτίσιμο του [STATE] με βάση το Fault ---
                # Προσομοιώνουμε τις μετρικές που θα έβλεπε το σύστημα εκείνη τη στιγμή
                cpu_state = "Critical (>90%)" if fault_type == "cpu" else "Normal"
                mem_state = "Critical (>90%)" if fault_type == "mem" else "Normal"
                lat_state = "Critical (>2000ms)" if fault_type in ["delay", "loss"] else "Normal"

                # Η ΔΙΚΗ ΣΟΥ ΙΔΕΑ ΕΦΑΡΜΟΣΜΕΝΗ: Το Document που θα ψάχνει η βάση
                structured_document = (
                    f"[STATE] Service: {service_name} | "
                    f"CPU: {cpu_state} | Memory: {mem_state} | Latency: {lat_state}\n"
                    f"[LOGS] {symptoms}"
                )
                
                # --- ΒΗΜΑ 3: Ορισμός των Metadata (Η έτοιμη λύση) ---
                runbook = RUNBOOKS[fault_type]
                
                documents.append(structured_document)
                
                # Τα Metadata είναι πλέον καθαρά JSON properties, όχι μέσα στο κείμενο!
                metadatas.append({
                    "service": service_name,
                    "fault_category": fault_type,
                    "diagnosis": runbook['diagnosis'],
                    "resolution": runbook['resolution'].format(service=service_name)
                })
                
                ids.append(f"rca-{fault_folder}-run{path_parts[-1]}")
                
            except Exception as e:
                print(f"Σφάλμα στο φάκελο {root}: {e}")

print(f"📥 Αποθήκευση {len(documents)} Δομημένων SRE Εγγραφών στη βάση...")
if documents:
    collection.add(documents=documents, metadatas=metadatas, ids=ids)
    print("✅ ΕΠΙΤΥΧΙΑ! Το Structured RAG είναι έτοιμο.")
else:
    print("⚠️ Δεν βρέθηκαν δεδομένα. Σιγουρέψου ότι τρέχεις το script μέσα στο RE2-SS.")