/**
 * @fileoverview Integration Tests for Favourite Controller - Get & Remove Favourites
 * @description This test suite validates the favourite places management functionality
 * including retrieving user's favourite places and removing places from favourites.
 * Tests cover authentication, authorization, and proper REST API responses.
 * 
 * @module tests/integration/favourite.places.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, generateTestJWT, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Favourite Controller - Get & Remove Tests
 * @description Tests for retrieving and removing favourite places.
 */
describe('Favourite Controller - Get & Remove Tests', () => {

    describe('GET /users/:userId/favourite-places', () => {
        describe('Happy Path - Successful Retrieval', () => {
            it('should return 200 and empty array when no favourites', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/favourite-places`);
                expect(response.status).toBe(200);
                expect(response.body.data.favourites).toEqual([]);
            });

            it('should return users favourite places', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Acropolis Museum', category: 'museum', description: 'Ancient Greek artifacts', city: 'Athens' });
                await db.addFavouritePlace(user.userId, testPlace.placeId);
                const response = await authRequest(token).get(`/users/${user.userId}/favourite-places`);
                expect(response.status).toBe(200);
                expect(response.body.data.favourites).toHaveLength(1);
                expect(response.body.data.favourites[0]).toMatchObject({ placeId: testPlace.placeId });
            });

            it('should return multiple favourite places', async () => {
                const { user, token } = await createAuthenticatedUser();
                const place1 = await db.createPlace({ name: 'Museum 1', category: 'museum', description: 'First museum', city: 'Athens' });
                const place2 = await db.createPlace({ name: 'Restaurant 1', category: 'restaurant', description: 'First restaurant', city: 'Athens' });
                await db.addFavouritePlace(user.userId, place1.placeId);
                await db.addFavouritePlace(user.userId, place2.placeId);
                const response = await authRequest(token).get(`/users/${user.userId}/favourite-places`);
                expect(response.status).toBe(200);
                expect(response.body.data.favourites).toHaveLength(2);
            });

            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).get(`/users/${user.userId}/favourite-places`);
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const response = await api.get(`/users/${user.userId}/favourite-places`);
                expect(response.status).toBe(401);
            });

            it('should return 403 when viewing another users favourites', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const response = await authRequest(token1).get(`/users/${user2.userId}/favourite-places`);
                expect(response.status).toBe(403);
            });
        });

        describe('Unhappy Path - User Not Found', () => {
            it('should return 403 for non-existent user', async () => {
                const { user: adminUser } = await createAuthenticatedUser({ role: 'admin' });
                const adminToken = generateTestJWT(adminUser);
                const response = await authRequest(adminToken).get(`/users/99999/favourite-places`);
                expect(response.status).toBe(403);
            });
        });
    });

    describe('DELETE /users/:userId/favourite-places/:favouriteId', () => {
        describe('Happy Path - Successful Removal', () => {
            it('should remove place from favourites', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'To Remove', category: 'cafe', description: 'Test cafe', city: 'Athens' });
                const favourite = await db.addFavouritePlace(user.userId, testPlace.placeId);
                const response = await authRequest(token).delete(`/users/${user.userId}/favourite-places/${favourite.favouriteId}`);
                expect(response.status).toBe(204);
            });

            it('should not exist after removal', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'To Remove', category: 'museum', description: 'Test museum', city: 'Athens' });
                const favourite = await db.addFavouritePlace(user.userId, testPlace.placeId);
                await authRequest(token).delete(`/users/${user.userId}/favourite-places/${favourite.favouriteId}`);
                const verifyResponse = await authRequest(token).get(`/users/${user.userId}/favourite-places`);
                expect(verifyResponse.body.data.favourites).toHaveLength(0);
            });
        });

        describe('Unhappy Path - Favourite Not Found', () => {
            it('should return 404 when favourite does not exist', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).delete(`/users/${user.userId}/favourite-places/99999`);
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('FAVOURITE_NOT_FOUND');
            });

            it('should return 404 when favourite belongs to another user', async () => {
                const { user: user1, token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', description: 'Test', city: 'Athens' });
                const user2Favourite = await db.addFavouritePlace(user2.userId, testPlace.placeId);
                const response = await authRequest(token1).delete(`/users/${user1.userId}/favourite-places/${user2Favourite.favouriteId}`);
                expect(response.status).toBe(404);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const response = await api.delete(`/users/${user.userId}/favourite-places/123`);
                expect(response.status).toBe(401);
            });

            it('should return 403 when removing from another users favourites', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', description: 'Test', city: 'Athens' });
                const user2Favourite = await db.addFavouritePlace(user2.userId, testPlace.placeId);
                const response = await authRequest(token1).delete(`/users/${user2.userId}/favourite-places/${user2Favourite.favouriteId}`);
                expect(response.status).toBe(403);
            });
        });
    });
});
