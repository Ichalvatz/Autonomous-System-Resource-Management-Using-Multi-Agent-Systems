/**
 * @fileoverview Integration Tests for User Controller - Settings Operations
 * @description This test suite validates the user settings management functionality
 * including retrieving and updating user preferences like language, notifications,
 * and privacy settings. Tests cover authentication, authorization, and HATEOAS compliance.
 * 
 * @module tests/integration/user.settings.test
 * @requires ../helpers/testUtils
 */

import { api, createAuthenticatedUser, createTestUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';

/**
 * User Controller - Settings Tests
 * @description Tests for retrieving and updating user settings.
 */
describe('User Controller - Settings Tests', () => {

    describe('GET /users/:userId/settings', () => {
        describe('Happy Path - Successful Retrieval', () => {
            it('should return 200 and settings', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/settings`);
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('settings');
                expect(response.body.message).toMatch(/retrieved successfully/i);
            });

            it('should return correct default settings', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/settings`);
                expect(response.status).toBe(200);
                expect(response.body.data.settings).toHaveProperty('userId');
                expect(response.body.data.settings.userId).toBe(user.userId);
            });

            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/settings`);
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Authorization Errors', () => {
            it('should return 401 without authentication', async () => {
                const user = await createTestUser();
                const response = await api.get(`/users/${user.userId}/settings`);
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to view another users settings', async () => {
                const { token: user1Token } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const user2 = await createTestUser({ email: 'user2@example.com' });
                const response = await authRequest(user1Token).get(`/users/${user2.userId}/settings`);
                expect(response.status).toBe(403);
            });
        });

        describe('Unhappy Path - Not Found Errors', () => {
            it('should return 403 for non-existent userId', async () => {
                const adminUser = await createTestUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken).get(`/users/99999/settings`);
                expect(response.status).toBe(403);
            });
        });
    });

    describe('PUT /users/:userId/settings', () => {
        describe('Happy Path - Successful Update', () => {
            it('should update language', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).put(`/users/${user.userId}/settings`).send({ language: 'el' });
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.settings.language).toBe('el');
            });

            it('should update notifications preferences', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).put(`/users/${user.userId}/settings`)
                    .send({ emailNotifications: false, pushNotifications: true });
                expect(response.status).toBe(200);
                expect(response.body.data.settings.emailNotifications).toBe(false);
                expect(response.body.data.settings.pushNotifications).toBe(true);
            });

            it('should update multiple settings at once', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).put(`/users/${user.userId}/settings`)
                    .send({ language: 'en', emailNotifications: true, pushNotifications: false, privacySettings: { shareLocation: false, publicProfile: true } });
                expect(response.status).toBe(200);
                expect(response.body.data.settings).toMatchObject({ language: 'en', emailNotifications: true, pushNotifications: false });
            });

            it('should contain HATEOAS links after update', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).put(`/users/${user.userId}/settings`).send({ language: 'el' });
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Authorization Errors', () => {
            it('should return 401 without authentication', async () => {
                const user = await createTestUser();
                const response = await api.put(`/users/${user.userId}/settings`).send({ language: 'el' });
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to update another users settings', async () => {
                const { token: user1Token } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const user2 = await createTestUser({ email: 'user2@example.com' });
                const response = await authRequest(user1Token).put(`/users/${user2.userId}/settings`).send({ language: 'el' });
                expect(response.status).toBe(403);
            });
        });

        describe('Unhappy Path - Not Found Errors', () => {
            it('should return 403 for non-existent userId', async () => {
                const adminUser = await createTestUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken).put(`/users/99999/settings`).send({ language: 'el' });
                expect(response.status).toBe(403);
            });
        });
    });
});
