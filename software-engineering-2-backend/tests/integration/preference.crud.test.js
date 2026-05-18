/**
 * @fileoverview Integration Tests for Preference Controller - Read & Delete Operations
 * @module tests/integration/preference.crud.test 
 * Testing Strategy:
 * - Integration Tests using In-Memory Database
 * - Cover read and delete operations for preference profiles
 * - Happy Paths (successful operations) and Unhappy Paths (errors)
 * - Authentication testing with JWT tokens (all endpoints require auth)
 * 
 * Endpoints we are testing:
 * - GET /users/:userId/preference-profiles - Retrieve profiles
 * - DELETE /users/:userId/preference-profiles/:profileId - Delete profile
 */

import { api, createAuthenticatedUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

describe('Preference Controller - Read & Delete Tests', () => {

    describe('GET /users/:userId/preference-profiles', () => {
        describe('Happy Path - Successful Retrieval Profiles', () => {
            it('should return 200 and empty array when do not exist profiles', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.profiles).toEqual([]);
                expect(response.body.message).toMatch(/retrieved successfully/i);
            });

            it('should return the preference profiles of the user', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Create profile
                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Travel Profile',
                    categories: ['MUSEUM', 'BEACH']
                });

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.profiles).toHaveLength(1);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'Travel Profile',
                    categories: ['MUSEUM', 'BEACH']
                });
                expect(response.body.data.profiles[0]).toHaveProperty('profileId');
            });

            it('should return multiple profiles', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Profile 1',
                    categories: ['MUSEUM', 'CULTURE']
                });

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Profile 2',
                    categories: ['RESTAURANT', 'NIGHTLIFE']
                });

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.profiles).toHaveLength(2);
            });

            it('should contain HATEOAS links', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                // Arrange
                const { user } = await createAuthenticatedUser();

                // Act - Without token
                const response = await api.get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to see profiles of another', async () => {
                // Arrange - Two users
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });

                // Act - User1 tries to see profiles of User2
                const response = await authRequest(token1).get(`/users/${user2.userId}/preference-profiles`);

                // Assert
                expect(response.status).toBe(403);
            });
        });

        describe('Unhappy Path - User Not Found', () => {
            it('should return 404 when the user does not exist', async () => {
                // Arrange
                const { user: adminUser } = await createAuthenticatedUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const nonExistentUserId = 99999;

                // Act
                const response = await authRequest(adminToken).get(`/users/${nonExistentUserId}/preference-profiles`);

                // Assert - Authorization middleware will return 403
                expect(response.status).toBe(403);
            });
        });
    });

    describe('DELETE /users/:userId/preference-profiles/:profileId', () => {
        describe('Happy Path - Successful Deletion Profile', () => {
            it('should delete the preference profile', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                const profile = await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'To Delete',
                    categories: ['MUSEUM']
                });

                // Act
                const response = await authRequest(token)
                    .delete(`/users/${user.userId}/preference-profiles/${profile.profileId}`);

                // Assert
                expect(response.status).toBe(204);
            });

            it('should not exist the profile after deletion', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                const profile = await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'To Delete',
                    categories: ['MUSEUM']
                });

                // Act - Deletion
                await authRequest(token)
                    .delete(`/users/${user.userId}/preference-profiles/${profile.profileId}`);

                // Verify - Check that it does not exist anymore
                const verifyResponse = await authRequest(token).get(`/users/${user.userId}/preference-profiles`);

                // Assert
                expect(verifyResponse.status).toBe(200);
                expect(verifyResponse.body.data.profiles).toHaveLength(0);
            });
        });

        describe('Unhappy Path - Profile Not Found', () => {
            it('should return 404 when the profile does not exist', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const nonExistentProfileId = 99999;

                // Act
                const response = await authRequest(token)
                    .delete(`/users/${user.userId}/preference-profiles/${nonExistentProfileId}`);

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('PROFILE_NOT_FOUND');
            });

            it('should return 404 when the profile belongs to another user', async () => {
                // Arrange
                const { user: user1, token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });

                const user2Profile = await db.addPreferenceProfile({
                    userId: user2.userId,
                    name: 'User2 Profile',
                    categories: ['MUSEUM']
                });

                // Act - User1 tries to delete the profile of User2
                const response = await authRequest(token1)
                    .delete(`/users/${user1.userId}/preference-profiles/${user2Profile.profileId}`);

                // Assert - Will not be found
                expect(response.status).toBe(404);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                // Arrange
                const { user } = await createAuthenticatedUser();
                const profileId = 123;

                // Act - Without token
                const response = await api.delete(`/users/${user.userId}/preference-profiles/${profileId}`);

                // Assert
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to delete profile of another', async () => {
                // Arrange
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });

                const user2Profile = await db.addPreferenceProfile({
                    userId: user2.userId,
                    name: 'User2 Profile',
                    categories: ['MUSEUM']
                });

                // Act - User1 tries to delete of User2
                const response = await authRequest(token1)
                    .delete(`/users/${user2.userId}/preference-profiles/${user2Profile.profileId}`);

                // Assert
                expect(response.status).toBe(403);
            });
        });
    });
});
