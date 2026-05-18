/**
 * k6 Load Test - Place Details Endpoint
 * 
 * Tests: GET /places/:placeId
 * Purpose: Verify system handles sustained load for place details requests
 * 
 * Non-Functional Requirements:
 * - 95% of requests must complete in under 500ms
 * - Error rate must be less than 1%
 * - System must support at least 10 concurrent users
 */

/* global __ENV */
import http from 'k6/http';
import { check, sleep } from 'k6';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const PLACE_IDS = [4321, 4322, 4323, 4324, 4325, 4326];

// Load Test Configuration
export const options = {
    stages: [
        { duration: '30s', target: 10 },  // Ramp up to 10 VUs over 30s
        { duration: '1m', target: 10 },   // Stay at 10 VUs for 1 minute
        { duration: '30s', target: 0 },   // Ramp down to 0 VUs
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],  // 95% of requests must complete within 500ms
        http_req_failed: ['rate<0.01'],    // Error rate must be less than 1%
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
            const body = JSON.parse(r.body);
            return body.place && body.place.placeId === placeId;
        },
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    // Small pause between requests (simulates real user behavior)
    sleep(1);
}
