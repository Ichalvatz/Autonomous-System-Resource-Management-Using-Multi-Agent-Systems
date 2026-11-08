"""
Is the agent's primary LLM answering right now? Exit 0 if it answers 3 times in a row, else 1.

full_campaign.sh runs this before every agent run. On 2026-10-21 gemini-3.1-flash-lite returned
503 "high demand" for long stretches; an agent run started then would either sit through the retries
(5/15/30 s per call) or be decided by the fallback model, which is a different agent.
The model name is read from 3-ai-agent/agent.py (PRIMARY_MODEL), so it follows the code.
GEMINI_API_KEY comes from the environment or the root .env; it is never printed.

Usage (from repo root):  .venv/bin/python3 4-load-testing/llm_ready.py
                         .venv/bin/python3 4-load-testing/llm_ready.py --calls-today        # no LLM call
                         .venv/bin/python3 4-load-testing/llm_ready.py --seconds-to-reset   # no LLM call
The key is on Gemini's free tier: 500 requests a day for the primary model, 20 for the fallback, reset at midnight
Pacific time (10:00 in Greece in winter). v14_finish.sh uses the last two to start the live runs on a day with enough.
"""
import csv
import os
import re
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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


def last_reset(now=None):
    """When the free tier's daily quota last reset: midnight Pacific time, as a local datetime."""
    pacific = (now or datetime.now()).astimezone(ZoneInfo("America/Los_Angeles"))
    return pacific.replace(hour=0, minute=0, second=0, microsecond=0).astimezone().replace(tzinfo=None)


def calls_today():
    """The agent's LLM requests (calls and retries, 3-ai-agent/incident_log.csv) since the quota last reset. Not
    counted: this script's own 3 per agent run and anything outside the agent (an upper bound needs ~+10%)."""
    path = os.path.join(ROOT, "3-ai-agent", "incident_log.csv")
    if not os.path.exists(path):
        return 0
    since = last_reset()
    return sum(int(r["llm_calls"] or 0) + int(r["llm_retries"] or 0) for r in csv.DictReader(open(path))
               if datetime.strptime(r["woke_at"], "%Y-%m-%d %H:%M:%S") >= since)


def seconds_to_reset():
    """Seconds until 5 min after the next reset."""
    return int((last_reset() + timedelta(days=1, minutes=5) - datetime.now()).total_seconds())


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
    if "--calls-today" in sys.argv:
        print(calls_today())
    elif "--seconds-to-reset" in sys.argv:
        print(seconds_to_reset())
    else:
        sys.exit(main())
