/**
 * @fileoverview Integration Tests for Preference Controller - Create Operations
 * @description This test suite validates the preference profile creation functionality.
 * Tests cover creating new preference profiles with categories, auto-generated names,
 * legacy field compatibility, duplicate name handling, as well as validation and
 * authentication error scenarios.
 * 
 * @module tests/integration/preference.create.test
 * @requires ../helpers/testUtils
 */

import { api, createAuthenticatedUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';

/**
 * Preference Controller - Create Profile Tests
 * @description Comprehensive tests for preference profile creation operations.
 */
describe('Preference Controller - Create Profile Tests', () => {

    describe('POST /users/:userId/preference-profiles', () => {
        describe('Happy Path - Successful Creation', () => {
            it('should create new preference profile', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 'My Travel Profile', categories: ['MUSEUM', 'BEACH', 'RESTAURANT'] });
                expect(response.status).toBe(201);
                expect(response.body.success).toBe(true);
                expect(response.body.data.profiles).toHaveLength(1);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'My Travel Profile', categories: ['MUSEUM', 'BEACH', 'RESTAURANT']
                });
            });

            it('should create profile with auto-generated name if not provided', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ categories: ['MUSEUM', 'CULTURE'] });
                expect(response.status).toBe(201);
                expect(response.body.data.profiles[0].name).toMatch(/^Profile \d+$/);
            });

            it('should support legacy selectedPreferences field', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 'Legacy Profile', selectedPreferences: ['PARK', 'SPORTS'] });
                expect(response.status).toBe(201);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'Legacy Profile', categories: ['PARK', 'SPORTS']
                });
            });

            it('should prevent duplicate profile names', async () => {
                const { user, token } = await createAuthenticatedUser();
                await authRequest(token).post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 'Test Profile', categories: ['MUSEUM'] });
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 'Test Profile', categories: ['BEACH'] });
                expect(response.status).toBe(201);
                expect(response.body.data.profiles).toHaveLength(2);
                expect(response.body.data.profiles[1].name).toMatch(/Test Profile \(\d+\)/);
            });

            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ categories: ['MUSEUM'] });
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('should return 400 when categories are missing', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 'Incomplete Profile' });
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_PROFILE_DATA');
            });

            it('should return 400 when categories is empty array', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ categories: [] });
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_PROFILE_DATA');
            });

            it('should return 400 when categories are invalid', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ categories: ['INVALID_CATEGORY', 'ANOTHER_INVALID'] });
                expect(response.status).toBe(400);
                expect(response.body.details.invalidValues).toContain('INVALID_CATEGORY');
            });

            it('should return 400 when profileName is not a string', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ profileName: 12345, categories: ['MUSEUM'] });
                expect(response.status).toBe(400);
                expect(response.body.message).toMatch(/must be a string/i);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const response = await api
                    .post(`/users/${user.userId}/preference-profiles`)
                    .send({ categories: ['MUSEUM'] });
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to create for another user', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const response = await authRequest(token1)
                    .post(`/users/${user2.userId}/preference-profiles`)
                    .send({ categories: ['MUSEUM'] });
                expect(response.status).toBe(403);
            });

            it('should return 403 for non-existent user', async () => {
                const { user: adminUser } = await createAuthenticatedUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken)
                    .post(`/users/99999/preference-profiles`)
                    .send({ categories: ['MUSEUM'] });
                expect(response.status).toBe(403);
            });
        });
    });
});
