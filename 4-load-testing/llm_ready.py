"""
Is the agent's primary LLM answering right now? Exit 0 if it answers 3 times in a row, else 1.

full_campaign.sh runs this before every agent run. On 2026-10-21 gemini-3.1-flash-lite returned
503 "high demand" for long stretches; an agent run started then would either sit through the retries
(5/15/30 s per call) or be decided by the fallback model, which is a different agent.
The model name is read from 3-ai-agent/agent.py (PRIMARY_MODEL), so it follows the code.
GEMINI_API_KEY comes from the environment or the root .env; it is never printed.

Usage (from repo root):  .venv/bin/python3 4-load-testing/llm_ready.py
"""
import os
import re
import sys
import time
from datetime import datetime

import litellm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRIES = 3
PAUSE_S = 5


def load_key():
    if os.environ.get("GEMINI_API_KEY"):
        return
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip().strip("\"'")


def main():
    load_key()
    litellm.suppress_debug_info = True
    with open(os.path.join(ROOT, "3-ai-agent", "agent.py")) as f:
        model = re.search(r'PRIMARY_MODEL = "([^"]+)"', f.read()).group(1)
    for i in range(TRIES):
        try:
            r = litellm.completion(model=model, max_tokens=20, timeout=30,
                                   messages=[{"role": "user", "content": "Reply with the single word OK."}])
            if not r.choices[0].message.content:
                raise RuntimeError("empty response")
        except Exception as e:
            print(f"[{datetime.now():%H:%M:%S}] llm_ready: {model} not ready ({type(e).__name__}, try {i + 1})")
            return 1
        if i < TRIES - 1:
            time.sleep(PAUSE_S)
    print(f"[{datetime.now():%H:%M:%S}] llm_ready: {model} answered {TRIES}/{TRIES}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
