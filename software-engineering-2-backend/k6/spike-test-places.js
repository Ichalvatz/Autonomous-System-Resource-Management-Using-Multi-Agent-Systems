/**
 * k6 Spike Test - Place Details Endpoint
 * 
 * Tests: GET /places/:placeId
 * Purpose: Verify system behavior under sudden traffic spikes
 * 
 * Non-Functional Requirements:
 * - System should handle sudden spikes without crashing
 * - 95% of requests must complete in under 1000ms during spike
 * - Error rate must be less than 5% during spike
 */

/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const PLACE_IDS = [4321, 4322, 4323, 4324, 4325, 4326];

// Spike Test Configuration
export const options = {
    stages: [
        { duration: '10s', target: 2 },   // Warm up with 2 VUs
        { duration: '5s', target: 20 },   // Spike to 20 VUs
        { duration: '30s', target: 20 },  // Stay at peak for 30s
        { duration: '10s', target: 2 },   // Scale down
        { duration: '10s', target: 0 },   // Cool down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'], // 95% of requests must complete within 1s during spike
        http_req_failed: ['rate<0.05'],    // Error rate must be less than 5% during spike
    },
};

// Main test function
export default function () {
    // Randomly select a place ID for each request
    const placeId = PLACE_IDS[Math.floor(Math.random() * PLACE_IDS.length)];

    const response = http.get(`${BASE_URL}/places/${placeId}`);

    // Validate response
    check(response, {
        'status is 200': (r) => r.status === 200,
        'response has place data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.place && body.place.placeId === placeId;
            } catch {
                return false;
            }
        },
        'response time < 1000ms': (r) => r.timings.duration < 1000,
    });

    // Minimal pause to simulate rapid requests during spike
    sleep(0.5);
}
