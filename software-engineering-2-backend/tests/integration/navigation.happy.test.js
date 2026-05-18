/**
 * @fileoverview Navigation Controller - Transportation Mode Tests
 * @description This test suite validates navigation calculations for different
 * transportation modes and point coordinate handling.
 * 
 * @module tests/integration/navigation.happy.test
 * @requires ../helpers/testUtils
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';

/**
 * Navigation Controller - Transportation & Point Tests
 * @description Tests for transportation modes and coordinate handling.
 */
describe('Navigation Controller - Transportation & Point Tests', () => {
    let token;

    beforeEach(async () => {
        const auth = await createAuthenticatedUser();
        token = auth.token;
    });

    describe('GET /navigation', () => {
        it('should calculate different times for different modes', async () => {
            const walkingResponse = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 40.6401, placeLongitude: 22.9444, transportationMode: 'WALKING' });
            const drivingResponse = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 40.6401, placeLongitude: 22.9444, transportationMode: 'DRIVING' });
            const publicResponse = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 40.6401, placeLongitude: 22.9444, transportationMode: 'PUBLIC_TRANSPORT' });
            expect(walkingResponse.body.data.route.estimatedTime).toBeGreaterThan(publicResponse.body.data.route.estimatedTime);
            expect(publicResponse.body.data.route.estimatedTime).toBeGreaterThan(drivingResponse.body.data.route.estimatedTime);
        });

        it('should contain startPoint with coordinates', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.startPoint).toEqual({ latitude: 37.9838, longitude: 23.7275 });
        });

        it('should contain endPoint with coordinates', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.endPoint).toEqual({ latitude: 37.9755, longitude: 23.7348 });
        });

        it('should handle zero distance (same location)', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9838, placeLongitude: 23.7275 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.distance).toBe(0);
            expect(response.body.data.route.estimatedTime).toBe(0);
        });
    });
});
