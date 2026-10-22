import http from 'k6/http';
import { check, sleep } from 'k6';

// SCENARIO cpuhog: a runaway background job.
//   Load:      8 VUs on /auth/login for 16 min, mid-band for 1 replica (healthy band 1-12 VUs), so before
//              the fault the right number of replicas is 1 and no strategy should act.
//   Fault:     at t = 4 min run_experiment.sh (SCENARIO=cpuhog) sends POST /chaos/cpuhog to every running
//              backend pod (at that point the single pod): a job that never ends blocks the event loop
//              600 ms at a time, with random 100-400 ms gaps, and the pod logs that the job
//              "rebuild-search-index" is still running. Only the processes are broken: new pods are healthy.
//   Symptoms:  CPU ~0.9, throttling ~18%, only ~4 rps; CPU per request ~3x healthy, event-loop lag ~1 s.
//              It looks like overload, and after a scale-up the server's p95 looks healthy (blind spot:
//              requests queued behind the blocked event loop are not timed).
//   Right fix: restart. Scored by cpu_recovery_s in evaluation_results_cpuhog.csv (not the server p95).
//   By hand:   k6 run 4-load-testing/k6/cpuhog.js, and after ~4 min ./4-load-testing/inject.sh cpuhog
// The load is identical to stuck.js and badconfig.js (and to fault_load.js, which all measured fault runs
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
