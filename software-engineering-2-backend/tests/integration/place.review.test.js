/**
 * @fileoverview Integration Tests for Place Controller - Submit Review
 * @description This test suite validates review submission functionality including
 * validation, authentication, and XSS sanitization.
 * 
 * @module tests/integration/place.review.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Place Controller - Submit Review Tests
 * @description Tests for review submission functionality.
 */
describe('Place Controller - Submit Review Tests', () => {

    describe('POST /places/:placeId/reviews', () => {
        describe('Happy Path - Successful Review Submission', () => {
            it('should create review with rating and comment', async () => {
                const testPlace = await db.createPlace({ name: 'Test Restaurant', category: 'restaurant', city: 'Athens' });
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`)
                    .send({ rating: 5, comment: 'Absolutely amazing experience!' });
                expect(response.status).toBe(201);
                expect(response.body.data.review).toMatchObject({ userId: user.userId, placeId: testPlace.placeId, rating: 5 });
            });

            it('should create review only with rating', async () => {
                const testPlace = await db.createPlace({ name: 'Test Cafe', category: 'cafe', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ rating: 4 });
                expect(response.status).toBe(201);
                expect(response.body.data.review.rating).toBe(4);
            });

            it('should sanitize HTML tags from comment', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'museum', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`)
                    .send({ rating: 5, comment: '<script>alert("XSS")</script>Great place!' });
                expect(response.status).toBe(201);
                expect(response.body.data.review.comment).not.toContain('<script>');
            });

            it('should contain HATEOAS links', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ rating: 5 });
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('should return 400 when rating is missing', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ comment: 'Nice place' });
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_REVIEW_DATA');
            });

            it('should return 400 with rating below 1', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ rating: 0 });
                expect(response.status).toBe(400);
            });

            it('should return 400 with rating above 5', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ rating: 10 });
                expect(response.status).toBe(400);
            });

            it('should return 400 with non-integer rating', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'museum', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`).send({ rating: 3.5 });
                expect(response.status).toBe(400);
            });

            it('should limit comment length to 500 characters', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reviews`)
                    .send({ rating: 5, comment: 'A'.repeat(600) });
                expect(response.status).toBe(201);
                expect(response.body.data.review.comment.length).toBeLessThanOrEqual(500);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const response = await api.post(`/places/${testPlace.placeId}/reviews`).send({ rating: 5 });
                expect(response.status).toBe(401);
            });

            it('should return 401 with invalid token', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const response = await api.post(`/places/${testPlace.placeId}/reviews`)
                    .set('Authorization', 'Bearer invalid_token').send({ rating: 5 });
                expect(response.status).toBe(401);
            });
        });

        describe('Unhappy Path - Place Not Found', () => {
            it('should return 404 when place does not exist', async () => {
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/99999/reviews`).send({ rating: 5 });
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('PLACE_NOT_FOUND');
            });
        });
    });
});
