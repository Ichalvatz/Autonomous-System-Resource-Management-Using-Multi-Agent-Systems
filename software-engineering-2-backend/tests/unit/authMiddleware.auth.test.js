/**
 * @fileoverview Unit Tests for Authentication Middleware - Token Handling
 * @module tests/unit/authMiddleware.auth.test 
 * Tests authentication middleware functions including:
 * - Token validation and verification (authenticate)
 * - Optional authentication (optionalAuth)
 * 
 * Tests error handling for invalid, expired, and missing tokens.
 */

import jwt from 'jsonwebtoken';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { createMockReq, createMockRes } from '../helpers/mockUtils.js';

/**
 * Test suite for JWT token authentication middleware.
 * Tests token presence, format, validity, and expiration handling.
 */
describe('Auth Middleware - Token Handling', () => {
    const originalEnv = process.env.JWT_SECRET;

    // Set up test JWT secret for token generation
    beforeAll(() => {
        process.env.JWT_SECRET = 'test-secret-key-for-testing';
    });

    // Restore original JWT secret after tests
    afterAll(() => {
        process.env.JWT_SECRET = originalEnv;
    });


    // Tests for required authentication middleware (blocks unauthenticated)
    describe('authenticate', () => {
        it('should return 401 when no authorization header', () => {
            const req = createMockReq();
            const res = createMockRes();
            const next = () => { };

            authenticate(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('AUTHENTICATION_REQUIRED');
            expect(res.jsonData.message).toContain('Authentication required');
        });

        it('should return 401 when authorization header does not start with Bearer', () => {
            const req = createMockReq('Basic sometoken');
            const res = createMockRes();
            const next = () => { };

            authenticate(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('AUTHENTICATION_REQUIRED');
        });

        it('should return 401 for invalid token (JsonWebTokenError)', () => {
            const req = createMockReq('Bearer invalid-token');
            const res = createMockRes();
            const next = () => { };

            authenticate(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('INVALID_TOKEN');
            expect(res.jsonData.message).toContain('Invalid authentication token');
        });

        it('should return 401 for expired token', () => {
            // Create an expired token
            const expiredToken = jwt.sign(
                { userId: 1, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '-1s' } // Already expired
            );

            const req = createMockReq(`Bearer ${expiredToken}`);
            const res = createMockRes();
            const next = () => { };

            authenticate(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('TOKEN_EXPIRED');
            expect(res.jsonData.message).toContain('token has expired');
        });

        it('should call next() and attach user info for valid token', () => {
            const validToken = jwt.sign(
                { userId: 1, username: 'testuser', role: 'USER' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`);
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            authenticate(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe(1);
            expect(req.user.username).toBe('testuser');
        });

        it('should return 401 for token with wrong secret', () => {
            const token = jwt.sign({ userId: 1 }, 'different-secret');
            const req = createMockReq(`Bearer ${token}`);
            const res = createMockRes();
            const next = () => { };

            authenticate(req, res, next);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('INVALID_TOKEN');
        });
    });

    describe('optionalAuth', () => {
        it('should attach user info when valid token provided', () => {
            const validToken = jwt.sign(
                { userId: 1, username: 'testuser' },
                'test-secret-key-for-testing',
                { expiresIn: '1h' }
            );

            const req = createMockReq(`Bearer ${validToken}`);
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            optionalAuth(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe(1);
        });

        it('should call next() without user when no token provided', () => {
            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            optionalAuth(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.user).toBeUndefined();
        });

        it('should call next() without user when invalid token provided', () => {
            const req = createMockReq('Bearer invalid-token');
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            optionalAuth(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.user).toBeUndefined();
        });

        it('should call next() when authorization header does not start with Bearer', () => {
            const req = createMockReq('Basic sometoken');
            const res = createMockRes();
            let nextCalled = false;
            const next = () => {
                nextCalled = true;
            };

            optionalAuth(req, res, next);

            expect(nextCalled).toBe(true);
            expect(req.user).toBeUndefined();
        });
    });
});
