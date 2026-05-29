/**
 * Shared helper for recommendations endpoint k6 tests
 * 
 * Contains common configuration, setup, and request logic
 * used by both load and spike tests.
 */

/* global __ENV */
import http from 'k6/http';
import { check } from 'k6';

// Configuration
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test user credentials (from in-memory database)
export const TEST_USER = {
    email: 'user1@example.com',
    password: 'password123',
    userId: 16180
};

/**
 * Setup function - authenticates and returns token + userId
 * Use this in your test's setup() export
 */
export function authenticateTestUser() {
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            email: TEST_USER.email,
            password: TEST_USER.password
        }),
        {
            headers: { 'Content-Type': 'application/json' }
        }
    );

    check(loginRes, {
        'login successful': (r) => r.status === 200,
    });

    const body = JSON.parse(loginRes.body);
    return { token: body.data.token, userId: TEST_USER.userId };
}

/**
 * Makes a GET request to the recommendations endpoint
 * @param {object} data - Contains token and userId from setup
 * @returns {object} - The HTTP response
 */
export function getRecommendations(data) {
    const headers = {
        'Authorization': `Bearer ${data.token}`,
        'Content-Type': 'application/json'
    };

    return http.get(
        `${BASE_URL}/users/${data.userId}/recommendations?latitude=40.6401&longitude=22.9444&maxDistance=100`,
        { headers }
    );
}

/**
 * Validates a recommendations response
 * @param {object} response - The HTTP response to validate
 * @param {number} maxDurationMs - Maximum allowed response time in ms
 */
export function validateRecommendationsResponse(response, maxDurationMs) {
    check(response, {
        'status is 200': (r) => r.status === 200,
        'response has recommendations': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.recommendations !== undefined;
            } catch {
                return false;
            }
        },
        [`response time < ${maxDurationMs}ms`]: (r) => r.timings.duration < maxDurationMs,
    });
}
