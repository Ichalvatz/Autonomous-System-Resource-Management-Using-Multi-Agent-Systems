import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '10m', target: 60 },
        { duration: '10m', target: 1 },
        { duration: '3m', target: 1 },
        { duration: '10m', target: 80 },
        { duration: '3m', target: 80 },
        { duration: '10m', target: 1 },  // 00:00 - 03:00 -> 1 Pod
        // 13:00 - 15:00 -> 1 Pod (Idle)
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