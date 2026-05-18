import chromadb

print("🧠 Ανοίγουμε τον εγκέφαλο του Agent για έλεγχο...\n")

# 1. Συνδεόμαστε στον φάκελο της βάσης που φτιάξαμε πριν
client = chromadb.PersistentClient(path="./agent_memory")

# 2. Φορτώνουμε τη συλλογή μας
collection = client.get_collection(name="rca_kubernetes_memory")

# 3. Τραβάμε ΟΛΑ τα δεδομένα που υπάρχουν μέσα (.get() χωρίς φίλτρα)
results = collection.get()

# Ελέγχουμε πόσα βρήκε
total_memories = len(results['ids'])
print(f"✅ Βρέθηκαν {total_memories} αναμνήσεις!\n")

# 4. Τα τυπώνουμε ωραία και νοικοκυρεμένα
for i in range(total_memories):
    print(f"🆔 ID : {results['ids'][i]}")
    print(f"🏷️ Tag (Metadata): {results['metadatas'][i]['resolution']}")
    print(f"📜 Text (exprience): {results['documents'][i]}")
    print("-" * 60)