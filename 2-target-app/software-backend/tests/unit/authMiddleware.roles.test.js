/**
 * @fileoverview Unit Tests for Authentication Middleware - Role-Based Access
 * @module tests/unit/authMiddleware.roles.test 
 * Tests authorization middleware functions including:
 * - User authorization (userAuth)
 * - Admin authorization (adminAuth)
 */

import jwt from 'jsonwebtoken';
import { userAuth, adminAuth } from '../../middleware/auth.js';
import { USER_ROLES } from '../../config/constants.js';
import { createMockReq, createMockRes } from '../helpers/mockUtils.js';

/**
 * Test suite for role-based access control middleware.
 * Tests userAuth (resource ownership) and adminAuth (admin-only access).
 */
describe('Auth Middleware - Role-Based Access', () => {
    const originalEnv = process.env.JWT_SECRET;

    // Set up test JWT secret for token generation
    beforeAll(() => {
        process.env.JWT_SECRET = 'test-secret-key-for-testing';
    });

    // Restore original JWT secret after tests
    afterAll(() => {
        process.env.JWT_SECRET = originalEnv;
    });


    // Tests for user authorization middleware (resource ownership checks)
    // Tests for user authorization: verifies owner access, denies others
    describe('userAuth', () => {
        // User accessing their own resource should be allowed
        it('should allow access when user ID matches authenticated user', () => {
            const validToken = jwt.sign(
                { userId: 123, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`, { userId: '123' });
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            userAuth(req, res, next);

            expect(nextCalled).toBe(true);
        });

        it('should return 403 when user ID does not match authenticated user', () => {
            const validToken = jwt.sign(
                { userId: 123, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`, { userId: '456' });
            const res = createMockRes();
            const next = () => { };

            userAuth(req, res, next);

            expect(res.statusCode).toBe(403);
            expect(res.jsonData.error).toBe('ACCESS_DENIED');
            expect(res.jsonData.message).toContain('your own resources');
        });

        it('should return 400 for invalid user ID format', () => {
            const validToken = jwt.sign(
                { userId: 123, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`, { userId: 'invalid' });
            const res = createMockRes();
            const next = () => { };

            userAuth(req, res, next);

            expect(res.statusCode).toBe(400);
            expect(res.jsonData.error).toBe('INVALID_USER_ID');
            expect(res.jsonData.message).toContain('valid integer');
        });

        it('should allow access when no userId parameter in route', () => {
            const validToken = jwt.sign(
                { userId: 123, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`, {});
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            userAuth(req, res, next);

            expect(nextCalled).toBe(true);
        });

        it('should fail authentication when no token provided', () => {
            const req = createMockReq(null, { userId: '123' });
            const res = createMockRes();
            const next = () => { };

            userAuth(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('AUTHENTICATION_REQUIRED');
        });

        it('should include details in non-production mode when access denied', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const validToken = jwt.sign(
                { userId: 123, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`, { userId: '456' });
            const res = createMockRes();
            const next = () => { };

            userAuth(req, res, next);

            expect(res.statusCode).toBe(403);
            expect(res.jsonData.details).toBeDefined();
            expect(res.jsonData.details.authenticatedUserId).toBe(123);
            expect(res.jsonData.details.requestedUserId).toBe(456);

            process.env.NODE_ENV = originalEnv;
        });
    });

    // Tests for admin authorization: only ADMIN role gets access
    describe('adminAuth', () => {
        // Admin token with ADMIN role should pass
        it('should allow access for admin users', () => {
            const adminToken = jwt.sign(
                { userId: 1, username: 'admin', role: USER_ROLES.ADMIN },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${adminToken}`);
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            adminAuth(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.admin).toBeDefined();
            expect(req.admin.role).toBe(USER_ROLES.ADMIN);
        });

        it('should return 403 for non-admin users', () => {
            const userToken = jwt.sign(
                { userId: 2, username: 'regularuser', role: USER_ROLES.USER },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${userToken}`);
            const res = createMockRes();
            const next = () => { };

            adminAuth(req, res, next);

            expect(res.statusCode).toBe(403);
            expect(res.jsonData.error).toBe('ACCESS_DENIED');
            expect(res.jsonData.message).toContain('Administrator access required');
            expect(res.jsonData.details.requiredRole).toBe(USER_ROLES.ADMIN);
            expect(res.jsonData.details.providedRole).toBe(USER_ROLES.USER);
        });

        it('should return 403 for users without role specified', () => {
            const userToken = jwt.sign(
                { userId: 3, username: 'noroleuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${userToken}`);
            const res = createMockRes();
            const next = () => { };

            adminAuth(req, res, next);

            expect(res.statusCode).toBe(403);
            expect(res.jsonData.details.providedRole).toBe(USER_ROLES.USER);
        });

        it('should fail authentication when no token provided', () => {
            const req = createMockReq();
            const res = createMockRes();
            const next = () => { };

            adminAuth(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('AUTHENTICATION_REQUIRED');
        });
    });
});
