#!/usr/bin/env bash
# Detector validation (~34 min): k6 drives the load, this script sets the
# replica count at each phase boundary (see detector_validation.js), and
# anomaly_detector.py --dry-run logs every reading. No LLM, no agent.
# Run from the repo root. Outputs:
#   5-ml-training/dry_run_readings.csv          (detector, one row per reading)
#   4-load-testing/detector_validation_phases.csv (phase start times)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY=aiops-backend-deployment
PHASES=4-load-testing/detector_validation_phases.csv

scale() { kubectl scale deployment "$DEPLOY" --replicas="$1" -n default >/dev/null; }
mark() { echo "$(date +%H:%M:%S),$1,$2,$3" >> "$PHASES"; echo "$(date +%H:%M:%S) phase $1: $2 replica(s), $3"; }

scale 1
kubectl rollout status deployment "$DEPLOY" -n default --timeout=120s >/dev/null
echo "time,phase,replicas,expected" > "$PHASES"

.venv/bin/python -u 3-ai-agent/anomaly_detector.py --dry-run > 4-load-testing/detector_validation_detector.log 2>&1 &
DETECTOR=$!
k6 run --quiet 4-load-testing/detector_validation.js > 4-load-testing/detector_validation_k6.log 2>&1 &
K6=$!
trap 'kill $DETECTOR $K6 2>/dev/null || true; scale 1' EXIT

mark A 1 normal;             sleep 300
mark B 1 "ANOMALY overload"; sleep 120
scale 2; mark C 2 normal;    sleep 300
mark D 2 "ANOMALY overload"; sleep 120
scale 3; mark E 3 normal;    sleep 300
mark F 3 "ANOMALY waste";    sleep 180
scale 2; mark G 2 normal;    sleep 300
mark H 2 "ANOMALY waste";    sleep 180
scale 1; mark I 1 normal;    sleep 240

wait $K6 || true
kill $DETECTOR 2>/dev/null || true  # CSV is flushed per row
sleep 2
echo "done"
