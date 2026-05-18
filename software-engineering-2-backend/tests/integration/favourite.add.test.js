/**
 * @fileoverview Integration Tests for Favourite Controller - Add to Favourites
 * @description This test suite validates the functionality for adding places to
 * user favourites. Tests cover successful additions, validation errors like
 * missing placeId, duplicate prevention, not found errors, and auth failures.
 * 
 * @module tests/integration/favourite.add.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Favourite Controller - Add Favourite Tests
 * @description Tests for adding places to user favourites.
 */
describe('Favourite Controller - Add Favourite Tests', () => {

    describe('POST /users/:userId/favourite-places', () => {
        describe('Happy Path - Successful Addition', () => {
            it('should add place to favourites', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Parthenon', category: 'landmark', description: 'Ancient temple', city: 'Athens' });
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`)
                    .send({ placeId: testPlace.placeId });
                expect(response.status).toBe(201);
                expect(response.body.data.favourite).toMatchObject({ placeId: testPlace.placeId, name: 'Parthenon' });
            });

            it('should return the place with reviews', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Museum', category: 'museum', description: 'Test museum', city: 'Athens' });
                await db.addReview({ userId: user.userId, placeId: testPlace.placeId, rating: 5, comment: 'Great!' });
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`)
                    .send({ placeId: testPlace.placeId });
                expect(response.status).toBe(201);
                expect(response.body.data.favourite.reviews).toHaveLength(1);
            });

            it('should contain HATEOAS links', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', description: 'Test cafe', city: 'Athens' });
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`)
                    .send({ placeId: testPlace.placeId });
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('should return 400 when placeId is missing', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`).send({});
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_INPUT');
            });

            it('should return 409 when place is already in favourites', async () => {
                const { user, token } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Duplicate Place', category: 'restaurant', description: 'Test', city: 'Athens' });
                await db.addFavouritePlace(user.userId, testPlace.placeId);
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`)
                    .send({ placeId: testPlace.placeId });
                expect(response.status).toBe(409);
            });
        });

        describe('Unhappy Path - Place Not Found', () => {
            it('should return 404 when place does not exist', async () => {
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/users/${user.userId}/favourite-places`)
                    .send({ placeId: 99999 });
                expect(response.status).toBe(404);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const { user } = await createAuthenticatedUser();
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', description: 'Test', city: 'Athens' });
                const response = await api.post(`/users/${user.userId}/favourite-places`).send({ placeId: testPlace.placeId });
                expect(response.status).toBe(401);
            });

            it('should return 403 when user tries to add to another users favourites', async () => {
                const { token: token1 } = await createAuthenticatedUser({ email: 'user1@example.com' });
                const { user: user2 } = await createAuthenticatedUser({ email: 'user2@example.com' });
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', description: 'Test', city: 'Athens' });
                const response = await authRequest(token1).post(`/users/${user2.userId}/favourite-places`)
                    .send({ placeId: testPlace.placeId });
                expect(response.status).toBe(403);
            });
        });
    });
});
