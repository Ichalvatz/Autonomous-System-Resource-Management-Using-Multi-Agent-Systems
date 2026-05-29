/**
 * @fileoverview Navigation Controller - Core Happy Path Integration Tests
 * @description This test suite validates the core navigation functionality including
 * route calculation with Haversine formula, transportation modes (WALKING, DRIVING,
 * PUBLIC_TRANSPORT), and proper HATEOAS link generation.
 * 
 * @module tests/integration/navigation.core.test
 * @requires ../helpers/testUtils
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';

/**
 * Navigation Controller - Core Tests
 * @description Tests for core navigation route calculation functionality.
 */
describe('Navigation Controller - Core Tests', () => {
    let token;

    beforeEach(async () => {
        const auth = await createAuthenticatedUser();
        token = auth.token;
    });

    describe('GET /navigation', () => {
        it('should return 200 and route data with valid coordinates', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9715, userLongitude: 23.7267, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            expect(response.body.data.route).toHaveProperty('startPoint');
            expect(response.body.data.route).toHaveProperty('endPoint');
            expect(response.body.data.route).toHaveProperty('distance');
        });

        it('should calculate correctly with Haversine formula', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 40.6401, placeLongitude: 22.9444 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.distance).toBeGreaterThan(290);
            expect(response.body.data.route.distance).toBeLessThan(310);
        });

        it('should use WALKING as default transportation mode', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.transportationMode).toBe('WALKING');
        });

        it('should accept WALKING transportation mode', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348, transportationMode: 'WALKING' });
            expect(response.status).toBe(200);
            expect(response.body.data.route.transportationMode).toBe('WALKING');
        });

        it('should accept DRIVING transportation mode', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348, transportationMode: 'DRIVING' });
            expect(response.status).toBe(200);
            expect(response.body.data.route.transportationMode).toBe('DRIVING');
        });

        it('should accept PUBLIC_TRANSPORT transportation mode', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348, transportationMode: 'PUBLIC_TRANSPORT' });
            expect(response.status).toBe(200);
            expect(response.body.data.route.transportationMode).toBe('PUBLIC_TRANSPORT');
        });

        it('should contain HATEOAS links', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('links');
        });
    });
});
