/**
 * @fileoverview Integration Tests for Preference Controller - Activate Operations
 * @description This test suite validates the preference profile activation functionality.
 * Tests cover successful activation scenarios, profile not found, user not found,
 * and authentication/authorization errors when activating preference profiles.
 * 
 * @module tests/integration/preference.activate.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Preference Controller - Activate Profile Tests
 * @description Tests for activating user preference profiles.
 */
describe('Preference Controller - Activate Profile Tests', () => {

    describe('POST /users/:userId/preference-profiles/:profileId/activate', () => {
        describe('Happy Path - Successful Activation', () => {
            it('should activate the preference profile', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Active Profile', categories: ['MUSEUM', 'BEACH']
                });
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles/${profile.profileId}/activate`);
                expect(response.status).toBe(200);
                expect(response.body.data.activeProfile).toBe(profile.profileId);
                expect(response.body.message).toMatch(/activated successfully/i);
            });

            it('should update the activeProfile of the user', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });
                await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles/${profile.profileId}/activate`);
                const updatedUser = await db.findUserById(user.userId);
                expect(updatedUser.activeProfile).toBe(profile.profileId);
            });

            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles/${profile.profileId}/activate`);
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Profile Not Found', () => {
            it('should return 404 when the profile does not exist', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/preference-profiles/99999/activate`);
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('PROFILE_NOT_FOUND');
            });
        });

        describe('Unhappy Path - User Not Found', () => {
            it('should return 403 when the user does not exist', async () => {
                const { user: adminUser } = await createAuthenticatedUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken)
                    .post(`/users/99999/preference-profiles/123/activate`);
                expect(response.status).toBe(403);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const response = await api
                    .post(`/users/${user.userId}/preference-profiles/123/activate`);
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to activate profile of another', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const user2Profile = await db.addPreferenceProfile({
                    userId: user2.userId, name: 'User2 Profile', categories: ['MUSEUM']
                });
                const response = await authRequest(token1)
                    .post(`/users/${user2.userId}/preference-profiles/${user2Profile.profileId}/activate`);
                expect(response.status).toBe(403);
            });
        });
    });
});
