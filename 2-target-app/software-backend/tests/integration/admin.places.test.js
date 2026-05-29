/**
 * @fileoverview Admin Places - Unhappy Path & Edge Case Tests
 * @description This test suite validates error scenarios and edge cases for
 * admin place updates including not found, access control, and edge cases.
 * 
 * @module tests/integration/admin.places.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Admin Places - Unhappy Path Tests
 * @description Tests for error handling in admin place operations.
 */
describe('Admin Places - Unhappy Path Tests', () => {
    let adminUser, adminToken, regularUser, regularToken;

    beforeEach(async () => {
        const adminAuth = await createAuthenticatedUser({ userId: 9001, email: 'admin@test.com', role: 'admin' });
        adminUser = adminAuth.user; adminToken = adminAuth.token;
        const regularAuth = await createAuthenticatedUser({ userId: 9002, email: 'regular@test.com', role: 'user' });
        regularUser = regularAuth.user; regularToken = regularAuth.token;
    });

    describe('PUT /admin/:adminId/places/:placeId - Not Found', () => {
        it('should return 404 when place does not exist', async () => {
            const response = await api.put(`/admin/${adminUser.userId}/places/99999`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Updated Name' });
            expect(response.status).toBe(404);
            expect(response.body.error).toBe('PLACE_NOT_FOUND');
        });
    });

    describe('Access Control', () => {
        it('should return 403 when regular user tries to update', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${regularUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${regularToken}`).send({ name: 'Hacked Name' });
            expect(response.status).toBe(403);
            expect(response.body.error).toBe('ACCESS_DENIED');
        });

        it('should return 401 without authentication', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .send({ name: 'Updated Name' });
            expect(response.status).toBe(401);
        });

        it('should return 401 with invalid token', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', 'Bearer invalid_token_here').send({ name: 'Updated Name' });
            expect(response.status).toBe(401);
        });
    });

    describe('Edge Cases', () => {
        it('should ignore unknown fields', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Updated Name', unknownField: 'ignored' });
            expect(response.status).toBe(200);
            expect(response.body.data.place).not.toHaveProperty('unknownField');
        });

        it('should handle empty update', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({});
            expect(response.status).toBe(200);
            expect(response.body.data.place.name).toBe('Test Place');
        });

        it('should update partial location data', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5, location: { latitude: 37.9838, longitude: 23.7275, address: 'Old Address' } });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ location: { address: 'New Address' } });
            expect(response.status).toBe(200);
            expect(response.body.data.place.location.address).toBe('New Address');
            expect(response.body.data.place.location.latitude).toBe(37.9838);
        });
    });
});
