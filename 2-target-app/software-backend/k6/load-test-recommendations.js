/**
 * k6 Load Test - Recommendations Endpoint
 * 
 * Tests: GET /users/:userId/recommendations
 * Purpose: Verify system handles sustained load for recommendations requests (with authentication)
 * 
 * Non-Functional Requirements:
 * - 95% of requests must complete in under 500ms
 * - Error rate must be less than 1%
 * - System must support at least 10 concurrent users
 */

import { sleep } from 'k6';
import {
    authenticateTestUser,
    getRecommendations,
    validateRecommendationsResponse
} from './helpers/recommendations-helper.js';

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

// Setup function - runs once before the test
export function setup() {
    return authenticateTestUser();
}

// Main test function
export default function (data) {
    const response = getRecommendations(data);
    validateRecommendationsResponse(response, 500);

    // Small pause between requests
    sleep(1);
}
