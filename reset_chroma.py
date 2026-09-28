import chromadb

# 1. Connect to your ChromaDB instance
print("Connecting to ChromaDB...")
chroma_client = chromadb.HttpClient(host='chromadb.aiops', port=80)

collection_name = "sre_runbooks"

# 2. Delete the existing collection
try:
    chroma_client.delete_collection(name=collection_name)
    print(f"✅ Collection '{collection_name}' successfully deleted.")
except Exception as e:
    print(f"⚠️ Could not delete collection (it might not exist yet): {e}")

# 3. Create a fresh, empty collection
try:
    chroma_client.create_collection(name=collection_name)
    print(f"✅ Fresh '{collection_name}' collection created. Database is now empty.")
except Exception as e:
    print(f"❌ Error creating collection: {e}")