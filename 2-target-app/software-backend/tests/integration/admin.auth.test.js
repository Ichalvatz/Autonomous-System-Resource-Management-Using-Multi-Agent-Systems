/**
 * @fileoverview Admin Auth & Security - Integration Tests
 * @description This test suite validates admin authentication and role-based access control.
 * Tests cover admin token generation in development mode, RBAC enforcement ensuring
 * only admin users can access admin endpoints, and security restrictions in production.
 * 
 * @module tests/integration/admin.auth.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { api, generateTestJWT, setupAdminTestUsers } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Admin Auth & Security - Integration Tests
 * @description Tests for admin authentication and role-based access control.
 */
describe('Admin Auth & Security - Integration Tests', () => {
    let adminUser;
    let adminToken;
    let regularUser;
    let regularToken;

    beforeEach(async () => {
        ({ adminUser, adminToken, regularUser, regularToken } = await setupAdminTestUsers());
    });


    describe('Security - Role-Based Access Control (RBAC)', () => {
        it('should allow access only to users with admin role', async () => {
            // Arrange
            const place = await db.createPlace({
                name: 'Test Place',
                category: 'MUSEUM',
                city: 'Athens',
                rating: 4.5
            });

            // Act - Admin access
            const adminResponse = await api
                .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Act - Regular user access
            const regularResponse = await api
                .get(`/admin/${regularUser.userId}/places/${place.placeId}/reports`)
                .set('Authorization', `Bearer ${regularToken}`);

            // Assert
            expect(adminResponse.status).toBe(200);
            expect(regularResponse.status).toBe(403);
        });

        it('should check the role in the JWT token', async () => {
            // Arrange
            const place = await db.createPlace({
                name: 'Test Place',
                category: 'MUSEUM',
                city: 'Athens',
                rating: 4.5
            });

            // Create token with user role (not admin)
            const userToken = generateTestJWT({ userId: 9999, role: 'user' });

            // Act
            const response = await api
                .get(`/admin/${adminUser.userId}/places/${place.placeId}/reports`)
                .set('Authorization', `Bearer ${userToken}`);

            // Assert
            expect(response.status).toBe(403);
            expect(response.body.error).toBe('ACCESS_DENIED');
            expect(response.body.details.requiredRole).toBe('admin');
            expect(response.body.details.providedRole).toBe('user');
        });

        it('should not allow regular user to perform any admin operation', async () => {
            // Arrange
            const place = await db.createPlace({
                name: 'Test Place',
                category: 'MUSEUM',
                city: 'Athens',
                rating: 4.5
            });

            // Act - Try both GET reports and PUT update with regular token
            const getResponse = await api
                .get(`/admin/${regularUser.userId}/places/${place.placeId}/reports`)
                .set('Authorization', `Bearer ${regularToken}`);

            const putResponse = await api
                .put(`/admin/${regularUser.userId}/places/${place.placeId}`)
                .set('Authorization', `Bearer ${regularToken}`)
                .send({ name: 'Hacked' });

            // Assert - Both should be denied
            expect(getResponse.status).toBe(403);
            expect(putResponse.status).toBe(403);
        });
    });

    describe('POST /admin/generate-token', () => {
        describe('Happy Path - Development Mode', () => {
            it('should generate admin token with valid credentials in development', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                process.env.NODE_ENV = 'development';
                process.env.ADMIN_DEV_USER = 'admin';
                process.env.ADMIN_DEV_PASS = 'admin123';

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({
                        username: 'admin',
                        password: 'admin123'
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('token');
                expect(response.body.data).toHaveProperty('adminId', 1001);
                expect(response.body.data).toHaveProperty('expiresIn');
                expect(response.body.message).toContain('development only');

                // Cleanup
                process.env.NODE_ENV = originalEnv;
            });

            it('should use default credentials when env vars not set', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                const originalUser = process.env.ADMIN_DEV_USER;
                const originalPass = process.env.ADMIN_DEV_PASS;

                process.env.NODE_ENV = 'development';
                delete process.env.ADMIN_DEV_USER;
                delete process.env.ADMIN_DEV_PASS;

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({
                        username: 'admin',
                        password: 'admin123'
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);

                // Cleanup
                process.env.NODE_ENV = originalEnv;
                if (originalUser) process.env.ADMIN_DEV_USER = originalUser;
                if (originalPass) process.env.ADMIN_DEV_PASS = originalPass;
            });
        });

        describe('Unhappy Path - Security Restrictions', () => {
            it('should return 403 in production environment', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                process.env.NODE_ENV = 'production';

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({
                        username: 'admin',
                        password: 'admin123'
                    });

                // Assert
                expect(response.status).toBe(403);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('DISABLED_IN_PRODUCTION');
                expect(response.body.message).toContain('disabled in production');

                // Cleanup
                process.env.NODE_ENV = originalEnv;
            });

            it('should return 401 with invalid username', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                process.env.NODE_ENV = 'development';
                process.env.ADMIN_DEV_USER = 'admin';
                process.env.ADMIN_DEV_PASS = 'admin123';

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({
                        username: 'wronguser',
                        password: 'admin123'
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('INVALID_CREDENTIALS');

                // Cleanup
                process.env.NODE_ENV = originalEnv;
            });

            it('should return 401 with invalid password', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                process.env.NODE_ENV = 'development';
                process.env.ADMIN_DEV_USER = 'admin';
                process.env.ADMIN_DEV_PASS = 'admin123';

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({
                        username: 'admin',
                        password: 'wrongpassword'
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('INVALID_CREDENTIALS');

                // Cleanup
                process.env.NODE_ENV = originalEnv;
            });

            it('should return 401 with missing credentials', async () => {
                // Arrange
                const originalEnv = process.env.NODE_ENV;
                process.env.NODE_ENV = 'development';

                // Act
                const response = await api
                    .post('/admin/auth/generate-token')
                    .send({});

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);

                // Cleanup
                process.env.NODE_ENV = originalEnv;
            });
        });
    });
});
