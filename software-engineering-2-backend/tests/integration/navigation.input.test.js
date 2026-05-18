/**
 * @fileoverview Navigation Controller - Validation Tests
 * @description This test suite validates input validation errors and public
 * endpoint access for the navigation controller.
 * 
 * @module tests/integration/navigation.input.test
 * @requires ../helpers/testUtils
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';

/**
 * Navigation Controller - Validation Tests
 * @description Tests for input validation and public endpoint access.
 */
describe('Navigation Controller - Validation Tests', () => {
    let token;

    beforeEach(async () => {
        const auth = await createAuthenticatedUser();
        token = auth.token;
    });

    describe('Unhappy Path - Invalid Input', () => {
        it('should return 400 when missing userLatitude', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(400);
            expect(response.body.error).toBe('INVALID_INPUT');
        });

        it('should return 400 when missing userLongitude', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(400);
        });

        it('should return 400 when missing placeLatitude', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLongitude: 23.7348 });
            expect(response.status).toBe(400);
        });

        it('should return 400 when missing placeLongitude', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755 });
            expect(response.status).toBe(400);
        });

        it('should return 400 with invalid transportation mode', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348, transportationMode: 'FLYING' });
            expect(response.status).toBe(400);
        });
    });

    describe('Public Endpoint', () => {
        it('should work without authentication token', async () => {
            const response = await api.get('/navigation').query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
        });
    });
});
