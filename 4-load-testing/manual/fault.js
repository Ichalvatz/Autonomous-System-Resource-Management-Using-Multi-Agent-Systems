// Shared by the hand-test scripts of this folder (thesis_notes/manual_testing.md): the fault as a second k6 scenario,
// one POST /chaos/<fault> at a given time, so one `k6 run` does the whole scenario (until 2026-11-20 the fault was a
// separate ./4-load-testing/inject.sh in a third terminal).
// The request goes through the ingress, so it reaches ONE pod: the same as inject.sh whenever there is one pod (stuck,
// cpuhog: 57 rps on 1 pod at t = 4 min; baseline / demo: ~1 pod until ~8 min). inject.sh reaches every pod.
// The backend declares /chaos before its request log and metrics, so the agent sees no trace of it (A34).
import http from 'k6/http';
import { BASE } from '../k6/lib/mix.js';

export const FAULTS = ['stuck', 'cpuhog'];

// The measured script's options plus one iteration of `inject` at `at` (a k6 duration: '4m', '90s').
export function withFault(measured, at) {
    return {
        ...measured,
        scenarios: {
            ...measured.scenarios,
            fault: { executor: 'shared-iterations', exec: 'inject', vus: 1, iterations: 1, startTime: at, maxDuration: '30s' },
        },
    };
}

export function checkFault(fault) {
    if (!FAULTS.includes(fault)) throw new Error(`FAULT must be ${FAULTS.join(' or ')} (got "${fault}")`);
    return fault;
}

export function injectFault(fault) {
    const res = http.post(`${BASE}/chaos/${fault}`, null, { tags: { name: 'inject' }, timeout: '10s' });
    const at = new Date().toTimeString().slice(0, 8);
    if (res.status === 200) {
        console.log(`${at} INJECT ${fault}: ${res.body}`);
    } else {
        // 404 CHAOS_DISABLED: the deployment has no CHAOS_ENABLED=true (2-target-app/backend-deployment.yaml)
        console.error(`${at} INJECT ${fault} FAILED: HTTP ${res.status} ${res.body || res.error}`);
    }
}
