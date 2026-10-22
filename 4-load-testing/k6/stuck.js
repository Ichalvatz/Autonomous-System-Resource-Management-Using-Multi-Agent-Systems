import http from 'k6/http';
import { check, sleep } from 'k6';

// SCENARIO stuck: a stuck dependency ("leaked DB connection pool").
//   Load:      8 VUs on /auth/login for 16 min, mid-band for 1 replica (healthy band 1-12 VUs), so before
//              the fault the right number of replicas is 1 and no strategy should act.
//   Fault:     at t = 4 min run_experiment.sh (SCENARIO=stuck) sends POST /chaos/stuck to every running
//              backend pod (at that point the single pod): every request then waits 3 s, with no CPU, and
//              the pod logs "[ERROR] DB connection pool exhausted". Only the processes are broken: new
//              pods are healthy.
//   Symptoms:  p95 ~3 s while CPU per pod is low.
//   Right fix: restart (more pods only dilute it). Scored by recovery_s in evaluation_results_stuck.csv.
//   By hand:   k6 run 4-load-testing/k6/stuck.js, and after ~4 min ./4-load-testing/inject.sh stuck
// The load is identical to cpuhog.js and badconfig.js (and to fault_load.js, which all measured fault runs
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
