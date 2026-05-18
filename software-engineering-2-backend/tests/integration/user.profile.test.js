/**
 * @fileoverview Integration Tests for User Controller - Profile Operations
 * @description This test suite validates the user profile management functionality
 * including retrieving and updating user profile information. Tests cover authentication,
 * authorization, validation, and proper REST API response structure including HATEOAS links.
 * 
 * @module tests/integration/user.profile.test
 * @requires ../helpers/testUtils
 * 
 * @test {GET /users/:userId/profile} - Profile retrieval endpoint tests
 * @test {PUT /users/:userId/profile} - Profile update endpoint tests
 */

import { api, createAuthenticatedUser, createTestUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';

/**
 * User Controller - Profile Tests
 * 
 * @description Comprehensive integration tests for user profile operations.
 * These tests validate:
 * - Profile retrieval with proper authentication
 * - Profile updates with field validation
 * - Authorization checks (users can only access their own profiles)
 * - Proper error responses for invalid requests
 * - HATEOAS link presence in responses
 */
describe('User Controller - Profile Tests', () => {

    /**
     * GET /users/:userId/profile endpoint tests
     * 
     * @description Tests for retrieving user profile information.
     * The endpoint requires authentication and users can only access their own profiles
     * unless they have admin privileges.
     */
    describe('GET /users/:userId/profile', () => {
        /**
         * Happy Path Tests - Successful Profile Retrieval
         * 
         * @description Tests scenarios where profile retrieval succeeds.
         * Validates response structure, data correctness, and HATEOAS compliance.
         */
        describe('Happy Path - Successful Retrieval', () => {
            /**
             * @test Verifies that an authenticated user can retrieve their profile
             * @expected Returns 200 with user data (excluding password)
             */
            it('should return 200 and the profile when authenticated', async () => {
                // Create a test user and authenticate them
                const { user, token } = await createAuthenticatedUser({ name: 'John Doe', email: 'john@example.com' });

                // Request the profile using the authenticated token
                const response = await authRequest(token).get(`/users/${user.userId}/profile`);

                // Verify successful response with correct user data
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.user).toMatchObject({ userId: user.userId, name: 'John Doe', email: 'john@example.com', role: 'user' });

                // Ensure sensitive data is not exposed
                expect(response.body.data.user).not.toHaveProperty('password');
            });

            /**
             * @test Verifies HATEOAS compliance in profile response
             * @expected Response contains navigational links including self reference
             */
            it('should contain HATEOAS links in the response', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/profile`);

                // Verify HATEOAS links are present for API discoverability
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
                expect(response.body.data.links).toHaveProperty('self');
            });

            /**
             * @test Validates the complete JSON response structure
             * @expected Response follows the standard API response format
             */
            it('should return correct JSON structure', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/profile`);

                // Verify response adheres to standardized API response structure
                expect(response.status).toBe(200);
                expect(response.body).toMatchObject({
                    success: true,
                    data: { user: expect.objectContaining({ userId: expect.any(Number) }), links: expect.any(Object) },
                    message: expect.any(String), error: null
                });
            });
        });

        /**
         * Unhappy Path Tests - Authentication Errors
         * 
         * @description Tests scenarios where authentication fails or is missing.
         * These tests ensure proper security measures are in place.
         */
        describe('Unhappy Path - Authentication Errors', () => {
            /**
             * @test Verifies that unauthenticated requests are rejected
             * @expected Returns 401 Unauthorized
             */
            it('should return 401 when no token', async () => {
                const user = await createTestUser();

                // Attempt to access profile without authentication token
                const response = await api.get(`/users/${user.userId}/profile`);
                expect(response.status).toBe(401);
            });

            /**
             * @test Verifies that invalid JWT tokens are rejected
             * @expected Returns 401 Unauthorized
             */
            it('should return 401 with invalid token', async () => {
                const user = await createTestUser();

                // Attempt to access profile with malformed JWT token
                const response = await api.get(`/users/${user.userId}/profile`).set('Authorization', `Bearer invalid.jwt.token`);
                expect(response.status).toBe(401);
            });

            /**
             * @test Verifies that users cannot access other users' profiles
             * @expected Returns 403 Forbidden
             */
            it('should return 403 when user tries to view another profile', async () => {
                // Create two different users
                const { token: userToken } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const otherUser = await createTestUser({ email: 'user2@example.com' });

                // Attempt to access another user's profile
                const response = await authRequest(userToken).get(`/users/${otherUser.userId}/profile`);
                expect(response.status).toBe(403);
            });
        });

        /**
         * Unhappy Path Tests - Validation Errors
         * 
         * @description Tests scenarios with invalid input parameters.
         * Validates proper error handling for malformed requests.
         */
        describe('Unhappy Path - Validation Errors', () => {
            /**
             * @test Verifies handling of non-numeric userId parameter
             * @expected Returns 404 Not Found for invalid route
             */
            it('should return 404 with invalid userId', async () => {
                const { token } = await createAuthenticatedUser();

                // Attempt to access profile with non-numeric userId
                const response = await authRequest(token).get('/users/invalid/profile');
                expect(response.status).toBe(404);
            });

            /**
             * @test Verifies handling of non-existent user ID
             * @expected Returns 403 as admin cannot access non-existent user
             */
            it('should return 403 for non-existent userId', async () => {
                // Use admin to bypass ownership check, still should fail
                const adminUser = await createTestUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);

                const response = await authRequest(adminToken).get(`/users/99999/profile`);
                expect(response.status).toBe(403);
            });
        });
    });

    /**
     * PUT /users/:userId/profile endpoint tests
     * 
     * @description Tests for updating user profile information.
     * Covers field updates, validation, and authorization checks.
     */
    describe('PUT /users/:userId/profile', () => {
        /**
         * Happy Path Tests - Successful Profile Updates
         * 
         * @description Tests scenarios where profile updates succeed.
         * Validates partial and full updates of user profile fields.
         */
        describe('Happy Path - Successful Update', () => {
            /**
             * @test Verifies that user name can be updated
             * @expected Returns 200 with updated name, other fields unchanged
             */
            it('should update the name', async () => {
                const { user, token } = await createAuthenticatedUser({ name: 'Old Name', email: 'user@example.com' });

                // Update only the name field
                const response = await authRequest(token).put(`/users/${user.userId}/profile`).send({ name: 'New Name' });

                // Verify name is updated while email remains unchanged
                expect(response.status).toBe(200);
                expect(response.body.data.user.name).toBe('New Name');
                expect(response.body.data.user.email).toBe('user@example.com');
            });

            /**
             * @test Verifies that user email can be updated
             * @expected Returns 200 with updated email address
             */
            it('should update the email', async () => {
                const { user, token } = await createAuthenticatedUser({ email: 'old@example.com' });

                // Update the email address
                const response = await authRequest(token).put(`/users/${user.userId}/profile`).send({ email: 'new@example.com' });

                expect(response.status).toBe(200);
                expect(response.body.data.user.email).toBe('new@example.com');
            });

            /**
             * @test Verifies that multiple fields can be updated simultaneously
             * @expected Returns 200 with all specified fields updated
             */
            it('should update multiple fields at once', async () => {
                const { user, token } = await createAuthenticatedUser();

                // Update multiple profile fields in a single request
                const response = await authRequest(token).put(`/users/${user.userId}/profile`)
                    .send({ name: 'Updated Name', phone: '+30 123 456 7890', location: { latitude: 37.9838, longitude: 23.7275 } });

                expect(response.status).toBe(200);
                expect(response.body.data.user).toMatchObject({ name: 'Updated Name', phone: '+30 123 456 7890' });
            });

            /**
             * @test Verifies HATEOAS links are present after profile update
             * @expected Response contains navigational links
             */
            it('should contain HATEOAS links after update', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).put(`/users/${user.userId}/profile`).send({ name: 'New Name' });

                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        /**
         * Unhappy Path Tests - Validation Errors
         * 
         * @description Tests scenarios where input validation fails.
         * Ensures proper error responses for invalid data.
         */
        describe('Unhappy Path - Validation Errors', () => {
            /**
             * @test Verifies rejection of invalid email format
             * @expected Returns 400 Bad Request with email validation error
             */
            it('should return 400 with invalid email format', async () => {
                const { user, token } = await createAuthenticatedUser();

                // Attempt to update with malformed email address
                const response = await authRequest(token).put(`/users/${user.userId}/profile`).send({ email: 'invalid-email' });

                expect(response.status).toBe(400);
                expect(response.body.message).toMatch(/email/i);
            });

            /**
             * @test Verifies rejection of duplicate email addresses
             * @expected Returns 409 Conflict when email is already in use
             */
            it('should return 409 when email already in use', async () => {
                // Create two users with different emails
                const { user: user1, token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                await createTestUser({ email: 'user2@example.com' });

                // Attempt to use user2's email for user1
                const response = await authRequest(token1).put(`/users/${user1.userId}/profile`).send({ email: 'user2@example.com' });
                expect(response.status).toBe(409);
            });

            /**
             * @test Verifies that protected fields cannot be modified by user
             * @expected Password and role fields are ignored, other updates succeed
             */
            it('should ignore unauthorized fields (password, role)', async () => {
                const { user, token } = await createAuthenticatedUser({ name: 'Original Name', role: 'user' });

                // Attempt to escalate privileges and change password
                const response = await authRequest(token).put(`/users/${user.userId}/profile`)
                    .send({ name: 'New Name', role: 'admin', password: 'newpassword123' });

                // Name should update, but role should remain unchanged
                expect(response.status).toBe(200);
                expect(response.body.data.user.name).toBe('New Name');
                expect(response.body.data.user.role).toBe('user');
            });
        });

        /**
         * Unhappy Path Tests - Authorization Errors
         * 
         * @description Tests scenarios where authorization fails.
         * Ensures users cannot modify other users' profiles.
         */
        describe('Unhappy Path - Authorization Errors', () => {
            /**
             * @test Verifies that unauthenticated update requests are rejected
             * @expected Returns 401 Unauthorized
             */
            it('should return 401 without authentication', async () => {
                const user = await createTestUser();

                // Attempt to update profile without authentication
                const response = await api.put(`/users/${user.userId}/profile`).send({ name: 'New Name' });
                expect(response.status).toBe(401);
            });

            /**
             * @test Verifies that users cannot modify other users' profiles
             * @expected Returns 403 Forbidden
             */
            it('should return 403 when user tries to update another profile', async () => {
                // Create two separate users
                const { token: user1Token } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const user2 = await createTestUser({ email: 'user2@example.com' });

                // User 1 attempts to modify user 2's profile
                const response = await authRequest(user1Token).put(`/users/${user2.userId}/profile`).send({ name: 'Hacked Name' });
                expect(response.status).toBe(403);
            });
        });

        /**
         * Unhappy Path Tests - Not Found Errors
         * 
         * @description Tests scenarios where the target resource doesn't exist.
         */
        describe('Unhappy Path - Not Found Errors', () => {
            /**
             * @test Verifies handling of updates to non-existent users
             * @expected Returns 403 as the authorization check fails first
             */
            it('should return 403 for non-existent userId', async () => {
                const adminUser = await createTestUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);

                // Attempt to update a user that doesn't exist
                const response = await authRequest(adminToken).put(`/users/99999/profile`).send({ name: 'New Name' });
                expect(response.status).toBe(403);
            });
        });
    });
});
