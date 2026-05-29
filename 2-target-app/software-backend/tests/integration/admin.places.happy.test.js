/**
 * @fileoverview Admin Places - Happy Path Tests
 * @description This test suite validates successful admin place update operations
 * including name, description, category, website, and location updates.
 * 
 * @module tests/integration/admin.places.happy.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, createAuthenticatedUser } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Admin Places - Happy Path Tests
 * @description Tests for successful admin place operations.
 */
describe('Admin Places - Happy Path Tests', () => {
    let adminUser, adminToken, regularUser;

    beforeEach(async () => {
        const adminAuth = await createAuthenticatedUser({ userId: 9001, email: 'admin@test.com', role: 'admin' });
        adminUser = adminAuth.user; adminToken = adminAuth.token;
        const regularAuth = await createAuthenticatedUser({ userId: 9002, email: 'regular@test.com', role: 'user' });
        regularUser = regularAuth.user;
    });

    describe('PUT /admin/:adminId/places/:placeId', () => {
        it('should update place name', async () => {
            const place = await db.createPlace({ name: 'Original Name', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Updated Name' });
            expect(response.status).toBe(200);
            expect(response.body.data.place.name).toBe('Updated Name');
        });

        it('should update place description', async () => {
            const place = await db.createPlace({ name: 'Test Place', description: 'Old', category: 'RESTAURANT', city: 'Athens', rating: 4.0 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ description: 'New description' });
            expect(response.status).toBe(200);
            expect(response.body.data.place.description).toBe('New description');
        });

        it('should update place category', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ category: 'CULTURE' });
            expect(response.status).toBe(200);
            expect(response.body.data.place.category).toBe('CULTURE');
        });

        it('should update place website', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5, website: 'https://old.com' });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ website: 'https://new.com' });
            expect(response.status).toBe(200);
            expect(response.body.data.place.website).toBe('https://new.com');
        });

        it('should update place location', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5, location: { latitude: 37.9838, longitude: 23.7275 } });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ location: { latitude: 40.6401, longitude: 22.9444 } });
            expect(response.status).toBe(200);
            expect(response.body.data.place.location.latitude).toBe(40.6401);
        });

        it('should update multiple fields', async () => {
            const place = await db.createPlace({ name: 'Old Name', description: 'Old desc', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'New Name', description: 'New desc', category: 'CULTURE' });
            expect(response.status).toBe(200);
            expect(response.body.data.place.name).toBe('New Name');
            expect(response.body.data.place.category).toBe('CULTURE');
        });

        it('should contain reviews in updated place', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'RESTAURANT', city: 'Athens', rating: 4.5 });
            await db.addReview({ placeId: place.placeId, userId: regularUser.userId, rating: 5, comment: 'Great!' });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Updated Place' });
            expect(response.status).toBe(200);
            expect(response.body.data.place).toHaveProperty('reviews');
        });

        it('should contain HATEOAS links', async () => {
            const place = await db.createPlace({ name: 'Test Place', category: 'MUSEUM', city: 'Athens', rating: 4.5 });
            const response = await api.put(`/admin/${adminUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${adminToken}`).send({ name: 'Updated Name' });
            expect(response.status).toBe(200);
            expect(response.body.data).toHaveProperty('links');
        });
    });
});
