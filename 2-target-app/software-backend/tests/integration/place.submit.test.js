/**
 * @fileoverview Integration Tests for Place Controller - Submit Report
 * @description This test suite validates report submission functionality including
 * validation, authentication, and XSS sanitization.
 * 
 * @module tests/integration/place.submit.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Place Controller - Submit Report Tests
 * @description Tests for report submission functionality.
 */
describe('Place Controller - Submit Report Tests', () => {

    describe('POST /places/:placeId/reports', () => {
        describe('Happy Path - Successful Report Submission', () => {
            it('should create report with description', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { user, token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`)
                    .send({ description: 'This place has incorrect opening hours' });
                expect(response.status).toBe(201);
                expect(response.body.data.report).toMatchObject({ userId: user.userId, placeId: testPlace.placeId });
            });

            it('should sanitize HTML tags from description', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`)
                    .send({ description: '<b>Wrong</b> <script>alert("hack")</script> location info' });
                expect(response.status).toBe(201);
                expect(response.body.data.report.description).not.toContain('<script>');
            });

            it('should limit description length to 1000 characters', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'museum', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`)
                    .send({ description: 'A'.repeat(1200) });
                expect(response.status).toBe(201);
                expect(response.body.data.report.description.length).toBeLessThanOrEqual(1000);
            });

            it('should contain HATEOAS links', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`)
                    .send({ description: 'Wrong information' });
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Unhappy Path - Validation Errors', () => {
            it('should return 400 when description is missing', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`).send({});
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('INVALID_REPORT_DATA');
            });

            it('should return 400 with empty description', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'restaurant', city: 'Athens' });
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/${testPlace.placeId}/reports`)
                    .send({ description: '   ' });
                expect(response.status).toBe(400);
            });
        });

        describe('Unhappy Path - Authentication Errors', () => {
            it('should return 401 without authentication', async () => {
                const testPlace = await db.createPlace({ name: 'Test Place', category: 'cafe', city: 'Athens' });
                const response = await api.post(`/places/${testPlace.placeId}/reports`).send({ description: 'Wrong info' });
                expect(response.status).toBe(401);
            });
        });

        describe('Unhappy Path - Place Not Found', () => {
            it('should return 404 when place does not exist', async () => {
                const { token } = await createAuthenticatedUser();
                const response = await authRequest(token).post(`/places/99999/reports`).send({ description: 'Wrong info' });
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('PLACE_NOT_FOUND');
            });
        });
    });
});
