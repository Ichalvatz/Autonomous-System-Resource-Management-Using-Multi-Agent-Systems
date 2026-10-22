import http from 'k6/http';
import { check, sleep } from 'k6';

// SCENARIO badconfig: a bad configuration change.
//   Load:      8 VUs on /auth/login for 16 min, mid-band for 1 replica (healthy band 1-12 VUs), so before
//              the fault the right number of replicas is 1 and no strategy should act.
//   Fault:     at t = 4 min run_experiment.sh (SCENARIO=badconfig) deploys a config change
//              (kubectl set env FEATURE_LOGIN_AUDIT=true): a new deployment revision, in every pod. Each
//              login then runs a synchronous PBKDF2 (1.5M iterations, ~0.35 s CPU). The bad state lives in
//              the pod template, not in the processes: restarted or new pods are born broken.
//   Symptoms:  CPU per request ~5x healthy in every pod, p95 > 1 s, logs without errors; the deployment
//              history shows the env change a minute before the problem.
//   Right fix: rollback (no replica count meets the p95 objective, a restart recreates the same config).
//              Scored by recovery_s in evaluation_results_badconfig.csv. run_experiment.sh removes the
//              flag before every run.
//   By hand:   k6 run 4-load-testing/k6/badconfig.js, after ~4 min ./4-load-testing/inject.sh badconfig,
//              and afterwards ./4-load-testing/inject.sh reset
// The load is identical to stuck.js and cpuhog.js (and to fault_load.js, which all measured fault runs
// used until 2026-10-11); only the fault differs, so the three scenarios stay comparable.
export const options = {
    scenarios: {
        steady: { executor: 'constant-vus', vus: 8, duration: '16m' },
    },
};

const loginPayload = JSON.stringify({ email: 'user1@example.com', password: 'password123' });

export default function () {
    const res = http.post('http://mwtback.aiops/auth/login', loginPayload,
        { headers: { 'Content-Type': 'application/json' } });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
}
