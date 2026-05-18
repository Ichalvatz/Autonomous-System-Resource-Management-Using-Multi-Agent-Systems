/**
 * @fileoverview Navigation Controller - Edge Cases Tests
 * @description This test suite validates edge cases for navigation calculations
 * including small distances, large distances, and coordinate precision.
 * 
 * @module tests/integration/navigation.validation.test
 * @requires ../helpers/testUtils
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';

/**
 * Navigation Controller - Edge Cases
 * @description Tests for edge cases in navigation calculations.
 */
describe('Navigation Controller - Edge Cases', () => {
    let token;

    beforeEach(async () => {
        const auth = await createAuthenticatedUser();
        token = auth.token;
    });

    describe('Edge Cases', () => {
        it('should handle very small distances (few meters)', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9848, placeLongitude: 23.7285 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.distance).toBeGreaterThan(0);
            expect(response.body.data.route.distance).toBeLessThan(1);
        });

        it('should handle very large distances', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 40.7128, placeLongitude: -74.0060 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.distance).toBeGreaterThan(7000);
            expect(response.body.data.route.distance).toBeLessThan(9000);
        });

        it('should handle negative coordinates (Southern hemisphere)', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: -33.8688, userLongitude: 151.2093, placeLatitude: -33.8650, placeLongitude: 151.2094 });
            expect(response.status).toBe(200);
            expect(response.body.data.route.startPoint.latitude).toBe(-33.8688);
            expect(response.body.data.route.distance).toBeGreaterThan(0);
        });

        it('should round distance to 1 decimal place', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            const distance = response.body.data.route.distance;
            expect(distance).toBe(Math.round(distance * 10) / 10);
        });

        it('should round estimatedTime to integer', async () => {
            const response = await api.get('/navigation').set('Authorization', `Bearer ${token}`)
                .query({ userLatitude: 37.9838, userLongitude: 23.7275, placeLatitude: 37.9755, placeLongitude: 23.7348 });
            expect(response.status).toBe(200);
            const estimatedTime = response.body.data.route.estimatedTime;
            expect(estimatedTime).toBe(Math.ceil(estimatedTime));
        });
    });
});
