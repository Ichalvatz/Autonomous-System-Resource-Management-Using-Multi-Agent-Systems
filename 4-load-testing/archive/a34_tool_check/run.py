"""A34 check 2 (no LLM): 57 rps of the mix; healthy, then stuck, then (after a reset) cpuhog; the two observation tools
called directly at each point. Writes outputs.txt next to this file."""
import os, subprocess, sys, time
from datetime import datetime
REPO = "/Users/ioannischalvatzis/Documents/LLM_AGENT"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs.txt")
sys.path.insert(0, os.path.join(REPO, "3-ai-agent"))
os.environ.setdefault("GEMINI_API_KEY", "unused")
import agent_tools as t

start = time.monotonic()
log = open(OUT, "w")
def note(msg):
    log.write(f"\n===== [{datetime.now():%H:%M:%S}] {msg}\n"); log.flush()
def at(sec):
    time.sleep(max(0, start + sec - time.monotonic()))
def tools(label):
    note(f"{label}: get_pod_breakdown()"); log.write(t.get_pod_breakdown() + "\n")
    note(f"{label}: get_kubernetes_logs()"); log.write(t.get_kubernetes_logs() + "\n"); log.flush()
def sh(cmd):
    r = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True, text=True)
    note(f"$ {cmd}\n{r.stdout[-600:]}{r.stderr[-300:]}")

k6 = subprocess.Popen(f"k6 run -e RATE=57 -e DURATION=560s -e TOKENS_FILE={REPO}/5-ml-training/k6_tokens.json "
                      "4-load-testing/k6/constant_rate.js", shell=True, cwd=REPO,
                      stdout=open(os.path.join(os.path.dirname(OUT), "k6.log"), "w"), stderr=subprocess.STDOUT)
at(140); tools("healthy, 57 rps")
at(150); sh("./4-load-testing/inject.sh stuck")
at(185); tools("stuck, 35 s after the inject")
sh("./4-load-testing/inject.sh reset")
at(340); sh("./4-load-testing/inject.sh cpuhog")
at(385); tools("cpuhog, 45 s after the inject")
sh("./4-load-testing/inject.sh reset")
k6.wait()
note(f"k6 exit {k6.returncode}")
