/**
 * @fileoverview Integration Tests for Preference Controller - Update Operations
 * @description This test suite validates the preference profile update functionality.
 * Tests cover updating preference profiles including name, categories, and legacy fields.
 * Validates authentication, authorization, validation errors, and proper REST API responses.
 * 
 * @module tests/integration/preference.update.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 * 
 * @test {PUT /users/:userId/preference-profiles/:profileId} - Profile update endpoint tests
 */

import { api, createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Preference Controller - Update Profile Tests
 * 
 * @description Comprehensive integration tests for preference profile update operations.
 * These tests validate:
 * - Full and partial profile updates (name, categories)
 * - Legacy field support (selectedPreferences)
 * - Validation of category values
 * - Authorization checks (users can only update their own profiles)
 * - Profile not found scenarios
 * - HATEOAS link presence in responses
 */
describe('Preference Controller - Update Profile Tests', () => {

    /**
     * PUT /users/:userId/preference-profiles/:profileId endpoint tests
     * 
     * @description Tests for updating user preference profiles.
     * Supports partial updates where only specified fields are modified.
     */
    describe('PUT /users/:userId/preference-profiles/:profileId', () => {
        /**
         * Happy Path Tests - Successful Profile Updates
         * 
         * @description Tests scenarios where preference profile updates succeed.
         * Validates full updates, partial updates, and legacy field compatibility.
         */
        describe('Happy Path - Successful Update', () => {
            /**
             * @test Verifies that a preference profile can be fully updated
             * @expected Returns 200 with updated name and categories
             */
            it('should update the preference profile', async () => {
                // Create user and add a preference profile
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Original Profile', categories: ['MUSEUM']
                });

                // Update both name and categories
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ name: 'Updated Profile', categories: ['MUSEUM', 'BEACH', 'RESTAURANT'] });

                // Verify all fields are updated correctly
                expect(response.status).toBe(200);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'Updated Profile', categories: ['MUSEUM', 'BEACH', 'RESTAURANT']
                });
            });

            /**
             * @test Verifies partial update with only name field
             * @expected Returns 200 with updated name, categories unchanged
             */
            it('should allow partial update (only name)', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Original', categories: ['MUSEUM', 'BEACH']
                });

                // Update only the name, keeping original categories
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ name: 'New Name' });

                // Verify name is updated while categories remain unchanged
                expect(response.status).toBe(200);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'New Name', categories: ['MUSEUM', 'BEACH']
                });
            });

            /**
             * @test Verifies partial update with only categories field
             * @expected Returns 200 with updated categories, name unchanged
             */
            it('should allow partial update (only categories)', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'My Profile', categories: ['MUSEUM']
                });

                // Update only the categories, keeping original name
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ categories: ['RESTAURANT', 'NIGHTLIFE'] });

                // Verify categories are updated while name remains unchanged
                expect(response.status).toBe(200);
                expect(response.body.data.profiles[0]).toMatchObject({
                    name: 'My Profile', categories: ['RESTAURANT', 'NIGHTLIFE']
                });
            });

            /**
             * @test Verifies backward compatibility with legacy field name
             * @expected selectedPreferences field maps to categories correctly
             */
            it('should support legacy selectedPreferences field', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });

                // Use legacy field name for backward compatibility
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ selectedPreferences: ['BEACH', 'SPORTS'] });

                // Verify legacy field is properly mapped to categories
                expect(response.status).toBe(200);
                expect(response.body.data.profiles[0].categories).toEqual(['BEACH', 'SPORTS']);
            });

            /**
             * @test Verifies HATEOAS compliance in update response
             * @expected Response contains navigational links
             */
            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });

                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ name: 'Updated' });

                // Verify HATEOAS links are present for API discoverability
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        /**
         * Unhappy Path Tests - Validation Errors
         * 
         * @description Tests scenarios where input validation fails.
         * Ensures proper error responses for invalid category data.
         */
        describe('Unhappy Path - Validation Errors', () => {
            /**
             * @test Verifies rejection of empty categories array
             * @expected Returns 400 Bad Request with INVALID_PROFILE_DATA error
             */
            it('should return 400 when categories is empty array', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });

                // Attempt to set empty categories array
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ categories: [] });

                // Verify validation error for empty categories
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_PROFILE_DATA');
            });

            /**
             * @test Verifies rejection of invalid category values
             * @expected Returns 400 with details about invalid values
             */
            it('should return 400 when categories are invalid', async () => {
                const { user, token } = await createAuthenticatedUser();
                const profile = await db.addPreferenceProfile({
                    userId: user.userId, name: 'Profile', categories: ['MUSEUM']
                });

                // Attempt to use non-existent category type
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/${profile.profileId}`)
                    .send({ categories: ['INVALID_TYPE'] });

                // Verify validation error with invalid value details
                expect(response.status).toBe(400);
                expect(response.body.details.invalidValues).toContain('INVALID_TYPE');
            });
        });

        /**
         * Unhappy Path Tests - Profile Not Found
         * 
         * @description Tests scenarios where the target profile doesn't exist.
         * Includes cross-user access attempt validation.
         */
        describe('Unhappy Path - Profile Not Found', () => {
            /**
             * @test Verifies handling of non-existent profile ID
             * @expected Returns 404 with PROFILE_NOT_FOUND error
             */
            it('should return 404 when the profile does not exist', async () => {
                const { user, token } = await createAuthenticatedUser();

                // Attempt to update a profile that doesn't exist
                const response = await authRequest(token)
                    .put(`/users/${user.userId}/preference-profiles/99999`)
                    .send({ name: 'Updated' });

                expect(response.status).toBe(404);
                expect(response.body.error).toBe('PROFILE_NOT_FOUND');
            });

            /**
             * @test Verifies that users cannot access other users' profiles via their own URL
             * @expected Returns 404 as the profile belongs to another user
             */
            it('should return 404 when trying to update another users profile', async () => {
                // Create two separate users
                const { user: user1, token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });

                // User2 creates a profile
                const user2Profile = await db.addPreferenceProfile({
                    userId: user2.userId, name: 'User2 Profile', categories: ['MUSEUM']
                });

                // User1 attempts to update user2's profile using user1's URL (cross-user ID attack)
                const response = await authRequest(token1)
                    .put(`/users/${user1.userId}/preference-profiles/${user2Profile.profileId}`)
                    .send({ name: 'Hacked' });

                // Profile not found because it doesn't belong to user1
                expect(response.status).toBe(404);
            });
        });

        /**
         * Unhappy Path Tests - Authentication Errors
         * 
         * @description Tests scenarios where authentication or authorization fails.
         * Ensures proper security measures are in place.
         */
        describe('Unhappy Path - Authentication Errors', () => {
            /**
             * @test Verifies that unauthenticated requests are rejected
             * @expected Returns 401 Unauthorized
             */
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();

                // Attempt to update profile without authentication token
                const response = await api
                    .put(`/users/${user.userId}/preference-profiles/123`)
                    .send({ name: 'Updated' });

                expect(response.status).toBe(401);
            });

            /**
             * @test Verifies that users cannot update other users' profiles
             * @expected Returns 403 Forbidden when accessing another user's URL
             */
            it('should return 403 when user tries to update profile of another', async () => {
                // Create two separate users
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });

                // User2 creates a profile
                const user2Profile = await db.addPreferenceProfile({
                    userId: user2.userId, name: 'User2 Profile', categories: ['MUSEUM']
                });

                // User1 attempts to update user2's profile using user2's URL path
                const response = await authRequest(token1)
                    .put(`/users/${user2.userId}/preference-profiles/${user2Profile.profileId}`)
                    .send({ name: 'Hacked' });

                // Authorization check fails - user1 cannot access user2's resources
                expect(response.status).toBe(403);
            });
        });
    });
});
