/**
 * @fileoverview Admin Reports - Integration Tests
 * @description This test suite validates admin report viewing functionality
 * including access control, HATEOAS links, and error handling.
 * 
 * @module tests/integration/admin.reports.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, setupAdminTestUsers } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Admin Reports - Integration Tests
 * @description Tests for admin report viewing functionality.
 */
describe('Admin Reports - Integration Tests', () => {
    let adminUser;
    let adminToken;
    let regularUser;
    let regularToken;

    beforeEach(async () => {
        ({ adminUser, adminToken, regularUser, regularToken } = await setupAdminTestUsers());
    });


    describe('GET /admin/:adminId/places/:placeId/reports', () => {
        describe('Happy Path - Admin Access', () => {
            it('should return 200 and list of reports for a place (admin)', async () => {
                // Arrange - Create Place and Reports
                const place = await db.createPlace({
                    name: 'Test Place',
                    category: 'MUSEUM',
                    city: 'Athens',
                    rating: 4.5
                });

                await db.addReport({
                    placeId: place.placeId,
                    userId: regularUser.userId,
                    reason: 'INAPPROPRIATE_CONTENT',
                    description: 'This place has inappropriate content'
                });

                await db.addReport({
                    placeId: place.placeId,
                    userId: regularUser.userId,
                    reason: 'INCORRECT_INFORMATION',
                    description: 'The information is incorrect'
                });

                // Act
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                    .set('Authorization', `Bearer ${adminToken}`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('reports');
                expect(response.body.data.reports).toBeInstanceOf(Array);
                expect(response.body.data.reports.length).toBeGreaterThanOrEqual(2);
                expect(response.body.data).toHaveProperty('totalReports');
                expect(response.body.data.totalReports).toBeGreaterThanOrEqual(2);
            });

            it('should contain HATEOAS links in each report', async () => {
                // Arrange
                const place = await db.createPlace({
                    name: 'Test Place 2',
                    category: 'RESTAURANT',
                    city: 'Athens',
                    rating: 4.0
                });

                await db.addReport({
                    placeId: place.placeId,
                    userId: regularUser.userId,
                    reason: 'SPAM',
                    description: 'This is spam'
                });

                // Act
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                    .set('Authorization', `Bearer ${adminToken}`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.reports.length).toBeGreaterThanOrEqual(1);
                expect(response.body.data.reports[0]).toHaveProperty('links');
            });

            it('should return empty array when there are no reports for the place', async () => {
                // Arrange - Place without reports
                const place = await db.createPlace({
                    name: 'Place Without Reports',
                    category: 'PARK',
                    city: 'Athens',
                    rating: 4.5
                });

                // Act
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                    .set('Authorization', `Bearer ${adminToken}`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.reports).toEqual([]);
                expect(response.body.data.totalReports).toBe(0);
            });

            it('should return 404 when the place does not exist', async () => {
                // Arrange - Non-existent placeId
                const nonExistentPlaceId = 99999;

                // Act
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${nonExistentPlaceId}/reports`)
                    .set('Authorization', `Bearer ${adminToken}`);

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('PLACE_NOT_FOUND');
            });
        });

        describe('Unhappy Path - Access Control', () => {
            it('should return 403 when regular user tries to view reports', async () => {
                // Arrange
                const place = await db.createPlace({
                    name: 'Test Place',
                    category: 'MUSEUM',
                    city: 'Athens',
                    rating: 4.5
                });

                // Act - Regular user tries to access admin endpoint
                const response = await api
                    .get(`/admin/${regularUser.userId}/places/${place.placeId}/reports`)
                    .set('Authorization', `Bearer ${regularToken}`);

                // Assert
                expect(response.status).toBe(403);
                expect(response.body.error).toBe('ACCESS_DENIED');
                expect(response.body.message).toContain('Administrator access required');
            });

            it('should return 401 without authentication token', async () => {
                // Arrange
                const place = await db.createPlace({
                    name: 'Test Place',
                    category: 'MUSEUM',
                    city: 'Athens',
                    rating: 4.5
                });

                // Act - No authentication
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`);

                // Assert
                expect(response.status).toBe(401);
            });

            it('should return 401 with invalid token', async () => {
                // Arrange
                const place = await db.createPlace({
                    name: 'Test Place',
                    category: 'MUSEUM',
                    city: 'Athens',
                    rating: 4.5
                });

                // Act - Invalid token
                const response = await api
                    .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                    .set('Authorization', 'Bearer invalid_token_here');

                // Assert
                expect(response.status).toBe(401);
            });
        });
    });
});
