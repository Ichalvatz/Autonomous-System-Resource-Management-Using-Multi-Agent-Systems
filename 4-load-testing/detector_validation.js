import http from 'k6/http';
import { check, sleep } from 'k6';

// Detector validation: every state of the baseline.js demo, held long enough
// to evaluate, with the replica count set by hand instead of by the agent.
// Run with detector_validation.sh, which scales the deployment at the phase
// boundaries and runs anomaly_detector.py --dry-run (no LLM, no agent).
//
//  phase  replicas  VUs  minutes  expected
//  A      1          5   5        normal
//  B      1         20   2        ANOMALY (overload -> scale up)
//  C      2         20   5        normal
//  D      2         30   2        ANOMALY (overload -> scale up)
//  E      3         30   5        normal
//  F      3         14   3        ANOMALY (waste -> scale down)
//  G      2         14   5        normal
//  H      2          5   3        ANOMALY (waste -> scale down)
//  I      1          5   4        normal
// VU changes take 10s; replica changes happen in the shell script.
export const options = {
    stages: [
        { duration: '10s', target: 5 },  { duration: '290s', target: 5 },   // A
        { duration: '10s', target: 20 }, { duration: '110s', target: 20 },  // B
                                         { duration: '300s', target: 20 },  // C
        { duration: '10s', target: 30 }, { duration: '110s', target: 30 },  // D
                                         { duration: '300s', target: 30 },  // E
        { duration: '10s', target: 14 }, { duration: '170s', target: 14 },  // F
                                         { duration: '300s', target: 14 },  // G
        { duration: '10s', target: 5 },  { duration: '170s', target: 5 },   // H
                                         { duration: '240s', target: 5 },   // I
    ],
};

const loginPayload = JSON.stringify({ email: 'user1@example.com', password: 'password123' });

export default function () {
    const res = http.post('http://mwtback.aiops/auth/login', loginPayload, {
        headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(1);
}
