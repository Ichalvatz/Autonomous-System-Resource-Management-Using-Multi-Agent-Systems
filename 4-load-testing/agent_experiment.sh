#!/usr/bin/env bash
# Full autonomous run (~40 min): the real detector (not dry-run) wakes the LLM
# agent, the agent scales the deployment, k6 plays baseline.js
# (5 -> 20 -> 30 -> 14 -> 5 VUs; expected replicas 1 -> 2 -> 3 -> 2 -> 1).
# Run from the repo root with GEMINI_API_KEY exported. Outputs in 4-load-testing/:
#   agent_experiment_detector.log   detector + agent output (reasoning, tool calls, verdicts)
#   agent_experiment_timeline.csv   every 10 s: time, k6 elapsed, replicas, the 5 metrics
#   agent_experiment_k6.log         k6 summary
set -euo pipefail
cd "$(dirname "$0")/.."
: "${GEMINI_API_KEY:?export GEMINI_API_KEY first}"

DEPLOY=aiops-backend-deployment
TIMELINE=4-load-testing/agent_experiment_timeline.csv
PROM=http://prometheus.aiops/api/v1/query

kubectl scale deployment "$DEPLOY" --replicas=1 -n default >/dev/null
kubectl rollout status deployment "$DEPLOY" -n default --timeout=120s >/dev/null
.venv/bin/python reset_chroma.py

q() { curl -s --get "$PROM" --data-urlencode "query=$1" | .venv/bin/python -c 'import sys,json; r=json.load(sys.stdin)["data"]["result"]; print(round(float(r[0]["value"][1]),4) if r else "")' 2>/dev/null || echo ""; }
echo "time,elapsed_s,replicas,throughput,avg_cpu_per_pod,latency_p95,cpu_throttling" > "$TIMELINE"

.venv/bin/python -u 3-ai-agent/anomaly_detector.py > 4-load-testing/agent_experiment_detector.log 2>&1 &
DETECTOR=$!
sleep 5
k6 run --quiet 4-load-testing/baseline.js > 4-load-testing/agent_experiment_k6.log 2>&1 &
K6=$!
trap 'kill $DETECTOR $K6 2>/dev/null || true' EXIT
START=$(date +%s)

while kill -0 $K6 2>/dev/null; do
  echo "$(date +%H:%M:%S),$(( $(date +%s) - START )),$(kubectl get deploy "$DEPLOY" -n default -o jsonpath='{.status.availableReplicas}'),$(q 'sum(rate(http_requests_total{app="aiops-backend"}[1m]))'),$(q 'sum(rate(container_cpu_usage_seconds_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / scalar(kube_deployment_status_replicas_available{namespace="default", deployment="aiops-backend-deployment"})'),$(q 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{app="aiops-backend"}[1m])) by (le))'),$(q 'sum(increase(container_cpu_cfs_throttled_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m])) / sum(increase(container_cpu_cfs_periods_total{namespace="default", pod=~"aiops-backend-deployment-.*", container!=""}[1m]))')" >> "$TIMELINE"
  sleep 10
done
wait $K6 || true
echo "k6 finished; final replicas: $(kubectl get deploy "$DEPLOY" -n default -o jsonpath='{.status.availableReplicas}')"
