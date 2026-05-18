/**
 * k6 Spike Test - Recommendations Endpoint
 * 
 * Tests: GET /users/:userId/recommendations
 * Purpose: Verify system behavior under sudden traffic spikes (with authentication)
 * 
 * Non-Functional Requirements:
 * - System should handle sudden spikes without crashing
 * - 95% of requests must complete in under 1000ms during spike
 * - Error rate must be less than 5% during spike
 */

import { sleep } from 'k6';
import {
    authenticateTestUser,
    getRecommendations,
    validateRecommendationsResponse
} from './helpers/recommendations-helper.js';

// Spike Test Configuration
export const options = {
    stages: [
        { duration: '10s', target: 2 },   // Warm up with 2 VUs
        { duration: '5s', target: 5 },   // Spike to 5 VUs (reduced to stay within capacity)
        { duration: '30s', target: 5 },  // Stay at peak for 30s
        { duration: '10s', target: 2 },   // Scale down
        { duration: '10s', target: 0 },   // Cool down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'], // 95% of requests must complete within 1s during spike
        http_req_failed: ['rate<0.05'],    // Error rate must be less than 5% during spike
    },
};

// Setup function - runs once before the test
export function setup() {
    return authenticateTestUser();
}

// Main test function
export default function (data) {
    const response = getRecommendations(data);
    validateRecommendationsResponse(response, 1000);

    // Minimal pause during spike
    sleep(0.5);
}
