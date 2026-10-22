"""
Helpers shared by the phase-2 ML scripts (2026-10-22): they drive the same k6 request mix as the experiments
(4-load-testing/k6/lib/mix.js) instead of Python threads, so the model learns the traffic it will judge.
Also the cluster helpers (scale, wait for ready pods) that capacity_discovery.py and collect_healthy_data.py share.
"""
import json
import random
import subprocess
import sys
import time
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "3-ai-agent"))
import nfr_metrics  # noqa: E402  (the PromQL shared with the detector)

K6_DIR = REPO / "4-load-testing" / "k6"
TOKENS_FILE = Path(__file__).resolve().parent / "k6_tokens.json"   # gitignored
APP = "http://mwtback.aiops"
DEPLOYMENT = "aiops-backend-deployment"


def make_token_pool(n=20):
    """Log n generated users in once (SEED_DATASET=load) and write their tokens for every k6 run of a series."""
    pool = []
    for i in random.sample(range(1, 1001), n):
        r = requests.post(f"{APP}/auth/login", json={"email": f"loaduser{i}@example.com", "password": "password123"},
                          timeout=10)
        r.raise_for_status()
        pool.append({"userId": 200000 + i, "token": r.json()["data"]["token"]})
    TOKENS_FILE.write_text(json.dumps(pool))
    return TOKENS_FILE


def run_k6(script, env, log_path=None):
    """Run a k6 script with the token pool; return its summary metrics (dict) or {} if k6 failed."""
    summary = Path(log_path or "/tmp/aiops_k6_summary").with_suffix(".summary.json")
    cmd = ["k6", "run", "--quiet", "--summary-export", str(summary), "-e", f"TOKENS_FILE={TOKENS_FILE}"]
    for key, value in env.items():
        cmd += ["-e", f"{key}={value}"]
    cmd.append(str(K6_DIR / script))
    with open(log_path or "/dev/null", "a") as log:
        code = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT).returncode
    if code not in (0, 99) or not summary.exists():  # 99: a threshold failed (none are set)
        return {}
    metrics = json.loads(summary.read_text())["metrics"]
    return {
        "k6_requests": metrics.get("http_reqs", {}).get("count", 0),
        "k6_dropped": metrics.get("dropped_iterations", {}).get("count", 0),
        "k6_failed_rate": metrics.get("http_req_failed", {}).get("value", 0.0),
        "k6_p95": metrics.get("http_req_duration", {}).get("p(95)", float("nan")) / 1000,
    }


def scale(replicas):
    subprocess.run(["kubectl", "scale", f"deployment/{DEPLOYMENT}", f"--replicas={replicas}"], check=True,
                   capture_output=True)


def restart_and_wait(replicas, timeout=240):
    """Fresh pods at the given count, all ready (a pod from an earlier step may carry state)."""
    scale(replicas)
    subprocess.run(["kubectl", "rollout", "restart", f"deployment/{DEPLOYMENT}"], check=True, capture_output=True)
    subprocess.run(["kubectl", "rollout", "status", f"deployment/{DEPLOYMENT}", f"--timeout={timeout}s"], check=True,
                   capture_output=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = nfr_metrics.fetch_reading()
        ready = None
        try:
            ready = nfr_metrics._query(nfr_metrics.queries()["ready_replicas"])
        except requests.RequestException:
            pass
        if ready == replicas and (r is None or r["replicas"] == replicas):
            return True
        time.sleep(5)
    return False
