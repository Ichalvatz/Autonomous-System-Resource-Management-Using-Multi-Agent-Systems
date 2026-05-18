/**
 * @fileoverview Integration Tests for Recommendation Controller - Unhappy Path
 * @description This test suite validates error scenarios for the recommendations endpoint
 * including user not found and authentication errors.
 * 
 * @module tests/integration/recommendation.core.test
 * @requires ../helpers/testUtils
 */

import { api, createAuthenticatedUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';

/**
 * Recommendation Controller - Unhappy Path Tests
 * @description Tests for error handling in recommendations.
 */
describe('Recommendation Controller - Unhappy Path Tests', () => {
    describe('GET /users/:userId/recommendations', () => {
        describe('User Not Found', () => {
            it('should return 403 when user does not exist', async () => {
                const { user: adminUser } = await createAuthenticatedUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken).get(`/users/99999/recommendations`);
                expect(response.status).toBe(403);
            });
        });

        describe('Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const response = await api.get(`/users/${user.userId}/recommendations`);
                expect(response.status).toBe(401);
            });

            it('should return 403 when viewing another users recommendations', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const response = await authRequest(token1).get(`/users/${user2.userId}/recommendations`);
                expect(response.status).toBe(403);
            });
        });
    });
});
