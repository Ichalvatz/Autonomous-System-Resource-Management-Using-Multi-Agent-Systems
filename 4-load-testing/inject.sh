#!/bin/bash
# Manual fault injection for hand testing (thesis_notes/manual_testing.md).
#   ./4-load-testing/inject.sh stuck       every backend pod waits 3 s per request on a "leaked DB pool"   (fix: restart)
#   ./4-load-testing/inject.sh cpuhog      a never-ending background job blocks the event loop          (fix: restart)
#   ./4-load-testing/inject.sh badconfig   deploys FEATURE_LOGIN_AUDIT=true (every login ~0.35 s CPU)    (fix: rollback)
#   ./4-load-testing/inject.sh reset       removes the bad config, rolling restart, 1 replica, waits for the rollout
#   ./4-load-testing/inject.sh status      replicas, pods, revision, and whether the bad config is present
# Run a load first in another terminal (k6 run 4-load-testing/fault_load.js) and the agent in a third one.
set -u
cd "$(dirname "$0")/.."
D=deploy/aiops-backend-deployment
case "${1:-}" in
  stuck|cpuhog)
    for p in $(kubectl get pods -l app=aiops-backend --field-selector=status.phase=Running -o name); do
      echo "$p: $(kubectl exec "$p" -- wget -qO- --post-data='' "http://127.0.0.1:3001/chaos/$1" 2>&1)"
    done ;;
  badconfig)
    kubectl set env $D FEATURE_LOGIN_AUDIT=true ;;
  reset)
    if kubectl get $D -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' | grep -qw FEATURE_LOGIN_AUDIT; then
      kubectl set env $D FEATURE_LOGIN_AUDIT-
    fi
    kubectl rollout restart $D && kubectl scale $D --replicas=1 && kubectl rollout status $D --timeout=180s
    echo "reset done; wait ~2 min before a new test (the detector ignores readings for 90 s after a replica change)" ;;
  status)
    kubectl get $D -o jsonpath='replicas {.status.availableReplicas}/{.spec.replicas}, revision {.metadata.annotations.deployment\.kubernetes\.io/revision}{"\n"}'
    kubectl get pods -l app=aiops-backend --no-headers
    if kubectl get $D -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' | grep -qw FEATURE_LOGIN_AUDIT; then
      echo "bad config PRESENT (FEATURE_LOGIN_AUDIT)"; else echo "bad config absent"; fi ;;
  *)
    sed -n '2,8p' "$0"; exit 1 ;;
esac
