#!/bin/bash
# Manual fault injection for hand testing (thesis_notes/manual_testing.md).
#   ./4-load-testing/inject.sh stuck       every backend pod: requests wait 3 s on a "leaked DB pool", then 503;
#                                          /ready fails, so the pod leaves the Service           (fix: restart)
#   ./4-load-testing/inject.sh cpuhog      a never-ending background job blocks the event loop     (fix: restart)
#   ./4-load-testing/inject.sh reset       rolling restart, 1 replica, waits for the rollout
#   ./4-load-testing/inject.sh status      replicas (desired / ready), pods, revision
# Run the scenario's load first in another terminal (k6 run 4-load-testing/k6/<stuck|cpuhog>.js)
# and the agent in a third one. (The badconfig scenario of phase 1 was removed on 2026-10-22.)
set -u
cd "$(dirname "$0")/.."
D=deploy/aiops-backend-deployment
case "${1:-}" in
  stuck|cpuhog)
    for p in $(kubectl get pods -l app=aiops-backend --field-selector=status.phase=Running -o name); do
      echo "$p: $(kubectl exec "$p" -- wget -qO- --post-data='' "http://127.0.0.1:3001/chaos/$1" 2>&1)"
    done ;;
  reset)
    kubectl rollout restart $D && kubectl scale $D --replicas=1 && kubectl rollout status $D --timeout=180s
    echo "reset done; wait ~2 min before a new test, so the detector sees healthy readings first" ;;
  status)
    kubectl get $D -o jsonpath='replicas {.status.readyReplicas}/{.spec.replicas} ready, revision {.metadata.annotations.deployment\.kubernetes\.io/revision}{"\n"}'
    kubectl get pods -l app=aiops-backend --no-headers ;;
  *)
    sed -n '2,9p' "$0"; exit 1 ;;
esac
