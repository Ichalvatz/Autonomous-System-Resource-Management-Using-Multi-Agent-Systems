"""
Save or restore the incident memory (ChromaDB collection "sre_runbooks") as JSON.

  python 3-ai-agent/memory_snapshot.py save    <file.json>
  python 3-ai-agent/memory_snapshot.py restore <file.json>   # replaces the WHOLE collection with the file

Used by 4-load-testing/mem_queue2.sh so that every run of the memory experiment starts from the
same memory (independent repetitions). Always `save` the current state before a `restore`.
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agent_tools  # noqa: E402  (same ChromaDB connection as the agent)


def save(path):
    c = agent_tools._get_collection()
    r = c.get(include=["documents", "metadatas"])
    rows = [{"id": i, "document": d, "metadata": m} for i, d, m in zip(r["ids"], r["documents"], r["metadatas"])]
    with open(path, "w") as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    print(f"saved {len(rows)} entries to {path}")


def restore(path):
    with open(path) as f:
        rows = json.load(f)
    c = agent_tools._get_collection()
    existing = c.get()["ids"]
    if existing:
        c.delete(ids=existing)
    for i in range(0, len(rows), 50):
        batch = rows[i:i + 50]
        c.add(ids=[r["id"] for r in batch], documents=[r["document"] for r in batch],
              metadatas=[r["metadata"] for r in batch])
    after = c.get()["ids"]
    assert sorted(after) == sorted(r["id"] for r in rows), "restore mismatch"
    print(f"restored {len(after)} entries from {path} (removed {len(existing)})")


if __name__ == "__main__":
    {"save": save, "restore": restore}[sys.argv[1]](sys.argv[2])
