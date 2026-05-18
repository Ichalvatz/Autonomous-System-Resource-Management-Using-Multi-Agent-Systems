/**
 * @fileoverview Integration Tests for Favourite Controller - Disliked Places
 * @description This test suite validates disliked places management functionality. 
 * Testing Strategy:
 * - Integration Tests using In-Memory Database
 * - Cover all endpoints: GET disliked, POST disliked, DELETE disliked
 * - Happy Paths and Unhappy Paths
 * - Authentication testing with JWT tokens
 * 
 * Endpoints we're testing:
 * - GET /users/:userId/disliked-places - Retrieve disliked places
 * - POST /users/:userId/disliked-places - Add place to disliked
 * - DELETE /users/:userId/disliked-places/:dislikedId - Remove from disliked
 */

import { api, createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

describe('Favourite Controller - Disliked Places Tests', () => {

    describe('GET /users/:userId/disliked-places', () => {
        describe('Happy Path - Successful Retrieval of Disliked Places', () => {
            it('should return 200 and empty array when there are no disliked places', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/disliked-places`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.dislikedPlaces).toEqual([]);
            });

            it('should return the user\'s disliked places', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({
                    name: 'Disliked Restaurant',
                    category: 'restaurant',
                    description: 'Not good',
                    city: 'Athens'
                });

                await db.addDislikedPlace(user.userId, testPlace.placeId);

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/disliked-places`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.dislikedPlaces).toHaveLength(1);
                expect(response.body.data.dislikedPlaces[0]).toMatchObject({
                    placeId: testPlace.placeId,
                    place: expect.objectContaining({
                        name: 'Disliked Restaurant'
                    })
                });
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('must return 401 without authentication', async () => {
                // Arrange
                const { user } = await createAuthenticatedUser();

                // Act
                const response = await api.get(`/users/${user.userId}/disliked-places`);

                // Assert
                expect(response.status).toBe(401);
            });
        });
    });

    describe('POST /users/:userId/disliked-places', () => {
        describe('Happy Path - Successful Addition to Disliked Places', () => {
            it('should add place to disliked', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({
                    name: 'Bad Place',
                    category: 'restaurant',
                    description: 'Not recommended',
                    city: 'Athens'
                });

                // Act
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/disliked-places`)
                    .send({ placeId: testPlace.placeId });

                // Assert
                expect(response.status).toBe(201);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toMatchObject({
                    dislikedId: expect.any(Number),
                    placeId: testPlace.placeId
                });
                expect(response.body.data).toHaveProperty('links');
            });

            it('should return 409 when the place is already in disliked', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({
                    name: 'Already Disliked',
                    category: 'cafe',
                    description: 'Test',
                    city: 'Athens'
                });

                await db.addDislikedPlace(user.userId, testPlace.placeId);

                // Act - Try to add again
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/disliked-places`)
                    .send({ placeId: testPlace.placeId });

                // Assert
                expect(response.status).toBe(409);
                expect(response.body.error).toBe('PLACE_ALREADY_DISLIKED');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('must return 400 when missing the placeId', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/disliked-places`)
                    .send({});

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_INPUT');
            });

            it('must return 404 when the place does not exist', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token)
                    .post(`/users/${user.userId}/disliked-places`)
                    .send({ placeId: 99999 });

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('USER_OR_PLACE_NOT_FOUND');
            });
        });
    });

    describe('DELETE /users/:userId/disliked-places/:dislikedId', () => {
        describe('Happy Path - Successful Removal from Disliked Places', () => {
            it('should remove place from disliked', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({
                    name: 'To Remove from Disliked',
                    category: 'restaurant',
                    description: 'Test',
                    city: 'Athens'
                });

                const disliked = await db.addDislikedPlace(user.userId, testPlace.placeId);

                // Act
                const response = await authRequest(token)
                    .delete(`/users/${user.userId}/disliked-places/${disliked.dislikedId}`);

                // Assert
                expect(response.status).toBe(204);
            });

            it('should not exist after removal', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({
                    name: 'Test Place',
                    category: 'cafe',
                    description: 'Test',
                    city: 'Athens'
                });

                const disliked = await db.addDislikedPlace(user.userId, testPlace.placeId);

                // Act
                await authRequest(token)
                    .delete(`/users/${user.userId}/disliked-places/${disliked.dislikedId}`);

                // Verify
                const verifyResponse = await authRequest(token).get(`/users/${user.userId}/disliked-places`);

                // Assert
                expect(verifyResponse.status).toBe(200);
                expect(verifyResponse.body.data.dislikedPlaces).toHaveLength(0);
            });
        });

        describe('Unhappy Path - Disliked Not Found', () => {
            it('should return 404 when the disliked does not exist', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                // Act
                const response = await authRequest(token)
                    .delete(`/users/${user.userId}/disliked-places/99999`);

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('DISLIKED_NOT_FOUND');
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('must return 401 without authentication', async () => {
                // Arrange
                const { user } = await createAuthenticatedUser();

                // Act
                const response = await api.delete(`/users/${user.userId}/disliked-places/123`);

                // Assert
                expect(response.status).toBe(401);
            });
        });
    });
});
