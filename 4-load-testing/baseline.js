import http from 'k6/http';
import { check, sleep } from 'k6';

// Scale-up / scale-down scenario within the 3-replica cap.
// Capacity (capacity_table.json): 1 replica safe up to 12 VUs, 2 up to 24, 3 up to 32.
// Healthy bands the detector was trained on (collect_healthy_data.py, OVERLAP=0.7):
// 1 replica 1-12 VUs, 2 replicas 8-24 VUs, 3 replicas 17-32 VUs. Scale-down steps
// must sit BELOW the band (the overlap is an anti-flapping deadband), so the
// 3 -> 2 step uses 14 VUs (18 VUs would be inside the 3-replica band).
// Each hold is long enough for detection (3 readings = 30s), the agent run,
// its 20s verification and the detector's 90s post-scale settle window.
// Total: ~40 minutes.
export const options = {
    stages: [
        { duration: '2m', target: 5 },   // warm-up                      -> 1 replica
        { duration: '3m', target: 5 },   // steady, healthy baseline      -> 1 replica
        { duration: '3m', target: 20 },  // overloads 1 replica           -> scale UP to 2
        { duration: '5m', target: 20 },
        { duration: '3m', target: 30 },  // overloads 2 replicas          -> scale UP to 3
        { duration: '5m', target: 30 },
        { duration: '3m', target: 14 },  // 3 replicas over-provisioned   -> scale DOWN to 2
        { duration: '5m', target: 14 },
        { duration: '3m', target: 5 },   // 2 replicas over-provisioned   -> scale DOWN to 1
        { duration: '6m', target: 5 },
    ],
};

const loginPayload = JSON.stringify({ email: 'user1@example.com', password: 'password123' });

export default function () {
    const loginUrl = 'http://mwtback.aiops/auth/login';
    const params = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(loginUrl, loginPayload, params);

    check(res, { 'status is 200': (r) => r.status === 200 });

    // Σταθερό sleep για να κρατάμε ελεγχόμενο το Throughput
    sleep(1);
}
