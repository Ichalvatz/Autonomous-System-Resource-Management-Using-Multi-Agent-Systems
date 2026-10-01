import http from 'k6/http';
import { check, sleep } from 'k6';

// Steady load for the "stuck dependency" fault experiment (run_experiment.sh, SCENARIO=stuck).
// 8 VUs on /auth/login sits mid-band for 1 replica (healthy band 1-12 VUs), so before
// the fault the right number of replicas is 1 and no strategy should act. At t=4 min
// run_experiment.sh injects POST /chaos/stuck into every backend pod: each request then
// waits 3 s for a "leaked DB connection" while using no CPU. Only a restart fixes it.
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
