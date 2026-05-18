/**
 * @fileoverview Integration Tests for Place Controller - Get Place Details
 * @description This test suite validates place detail retrieval including
 * getting single place information with HATEOAS links and reviews.
 * Tests cover successful retrieval and not-found error scenarios.
 * 
 * @module tests/integration/place.details.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createTestUser } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Place Controller - Get Details Tests
 * @description Tests for retrieving place details and reviews.
 */
describe('Place Controller - Get Details Tests', () => {
    describe('GET /places/:placeId', () => {
        describe('Happy Path - Successful Retrieval', () => {
            it('should return 200 and place data', async () => {
                const testPlace = await db.createPlace({ name: 'Acropolis Museum', category: 'museum', description: 'Modern museum', city: 'Athens', country: 'Greece', location: { latitude: 37.9684, longitude: 23.7283 }, website: 'https://example.com', rating: 4.8 });
                const response = await api.get(`/places/${testPlace.placeId}`);
                expect(response.status).toBe(200);
                expect(response.body.data.place).toMatchObject({ placeId: testPlace.placeId, name: 'Acropolis Museum' });
            });

            it('should contain HATEOAS links', async () => {
                const testPlace = await db.createPlace({ name: 'Parthenon', category: 'landmark', city: 'Athens', country: 'Greece' });
                const response = await api.get(`/places/${testPlace.placeId}`);
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });

            it('should return empty reviews array if none exist', async () => {
                const testPlace = await db.createPlace({ name: 'New Place', category: 'restaurant', city: 'Athens' });
                const response = await api.get(`/places/${testPlace.placeId}`);
                expect(response.status).toBe(200);
                expect(response.body.data.place.reviews).toEqual([]);
            });
        });

        describe('Unhappy Path - Place Not Found', () => {
            it('should return 404 when place does not exist', async () => {
                const response = await api.get(`/places/99999`);
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('PLACE_NOT_FOUND');
            });

            it('should return 404 with invalid placeId format', async () => {
                const response = await api.get('/places/invalid-id');
                expect(response.status).toBe(404);
            });
        });
    });

    describe('GET /places/:placeId/reviews', () => {
        describe('Happy Path - Successful Retrieval', () => {
            it('should return 200 and empty array when no reviews', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const response = await api.get(`/places/${testPlace.placeId}/reviews`);
                expect(response.status).toBe(200);
                expect(response.body.data.reviews).toEqual([]);
            });

            it('should return all reviews for the place', async () => {
                const testPlace = await db.createPlace({ name: 'Popular Restaurant', category: 'restaurant', city: 'Athens' });
                const user1 = await createTestUser({ email: 'user1@example.com' });
                const user2 = await createTestUser({ email: 'user2@example.com' });
                await db.addReview({ userId: user1.userId, placeId: testPlace.placeId, rating: 5, comment: 'Excellent!' });
                await db.addReview({ userId: user2.userId, placeId: testPlace.placeId, rating: 4, comment: 'Very good' });
                const response = await api.get(`/places/${testPlace.placeId}/reviews`);
                expect(response.status).toBe(200);
                expect(response.body.data.reviews).toHaveLength(2);
            });

            it('should contain HATEOAS links', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const response = await api.get(`/places/${testPlace.placeId}/reviews`);
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Place Not Found', () => {
            it('should return 404 when place does not exist', async () => {
                const response = await api.get(`/places/99999/reviews`);
                expect(response.status).toBe(404);
            });
        });
    });
});
