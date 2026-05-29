/**
 * @fileoverview Unit Tests for Authentication Service - Login & Token Operations
 * @description This test suite validates the authentication service functions including
 * user login, JWT token verification, and password change functionality.
 * Tests cover validation errors, authentication failures, and successful operations.
 * 
 * @module tests/unit/authService.login.test
 * @requires ../../services/authService
 * @requires ../../config/db
 * @requires ../../utils/errors
 */

import * as authService from '../../services/authService.js';
import db from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { ValidationError, AuthenticationError } from '../../utils/errors.js';

/**
 * Auth Service - Login & Token Test Suite
 * @description Tests for login, token verification, and password management.
 */
describe('Auth Service - Login & Token', () => {
    const originalEnv = process.env.JWT_SECRET;
    let testUser;
    const testPassword = 'SecurePass123';
    let hashedPassword;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test-secret-key-for-testing';
    });

    afterAll(() => {
        process.env.JWT_SECRET = originalEnv;
    });

    beforeEach(async () => {
        // Hash password
        hashedPassword = await bcrypt.hash(testPassword, 10);

        // Create test user with hashed password
        testUser = await db.createUser({
            name: 'Auth Test User',
            email: 'auth@example.com',
            password: hashedPassword,
            role: 'user'
        });
    });

    describe('loginUser', () => {
        it('should login with correct credentials', async () => {
            const result = await authService.loginUser('auth@example.com', testPassword);

            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('user');
            expect(result.user.email).toBe('auth@example.com');
            expect(result.user.password).toBeUndefined(); // Sanitized
        });

        it('should return a valid JWT token', async () => {
            const result = await authService.loginUser('auth@example.com', testPassword);

            expect(typeof result.token).toBe('string');
            expect(result.token.split('.').length).toBe(3); // JWT format: header.payload.signature
        });

        it('should throw ValidationError when email is missing', async () => {
            await expect(authService.loginUser('', testPassword))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError when password is missing', async () => {
            await expect(authService.loginUser('auth@example.com', ''))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid email format', async () => {
            await expect(authService.loginUser('invalid-email', testPassword))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw AuthenticationError for non-existent email', async () => {
            await expect(authService.loginUser('nonexistent@example.com', testPassword))
                .rejects
                .toThrow(AuthenticationError);
        });

        it('should throw AuthenticationError for wrong password', async () => {
            await expect(authService.loginUser('auth@example.com', 'WrongPassword123'))
                .rejects
                .toThrow(AuthenticationError);
        });

        it('should throw AuthenticationError if user has no password field', async () => {
            // Create user without password
            await db.createUser({
                name: 'No Password User',
                email: 'nopass@example.com',
                role: 'user'
            });

            await expect(authService.loginUser('nopass@example.com', 'anypassword'))
                .rejects
                .toThrow(AuthenticationError);
        });
    });

    describe('verifyToken', () => {
        let validToken;

        beforeEach(async () => {
            const result = await authService.loginUser('auth@example.com', testPassword);
            validToken = result.token;
        });

        it('should verify a valid token', () => {
            const decoded = authService.verifyToken(validToken);

            expect(decoded).toHaveProperty('userId');
            expect(decoded).toHaveProperty('email');
            expect(decoded).toHaveProperty('role');
            expect(decoded.email).toBe('auth@example.com');
        });

        it('should throw AuthenticationError for invalid token', () => {
            expect(() => authService.verifyToken('invalid.token.here'))
                .toThrow(AuthenticationError);
        });

        it('should throw AuthenticationError for malformed token', () => {
            expect(() => authService.verifyToken('not-a-jwt'))
                .toThrow(AuthenticationError);
        });

        it('should decode token payload correctly', () => {
            const decoded = authService.verifyToken(validToken);

            expect(decoded).toHaveProperty('userId');
            expect(decoded.userId).toBeGreaterThan(0);
            expect(decoded.email).toBe('auth@example.com');
            expect(decoded.role).toBe('user');
        });

        it('should throw AuthenticationError with expired message for expired token', async () => {
            // Create an expired token using jwt.sign directly
            const jwt = await import('jsonwebtoken');
            const expiredToken = jwt.default.sign(
                { userId: testUser.userId, email: 'auth@example.com', role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '-1s' } // Already expired
            );

            expect(() => authService.verifyToken(expiredToken)).toThrow(AuthenticationError);
            expect(() => authService.verifyToken(expiredToken)).toThrow(/expired/);
        });
    });

    describe('changePassword', () => {
        it('should change password successfully', async () => {
            // Re-fetch user to get correct userId
            const currentUser = await db.findUserByEmail('auth@example.com');
            const newPassword = 'NewSecurePass456';
            const result = await authService.changePassword(currentUser.userId, testPassword, newPassword);

            expect(result).toBe(true);

            // Verify can login with new password
            const loginResult = await authService.loginUser('auth@example.com', newPassword);
            expect(loginResult).toHaveProperty('token');
        });

        it('should throw AuthenticationError for wrong old password', async () => {
            await expect(authService.changePassword(testUser.userId, 'WrongOldPass', 'NewPass123'))
                .rejects
                .toThrow(AuthenticationError);
        });

        it('should throw ValidationError for weak new password', async () => {
            await expect(authService.changePassword(testUser.userId, testPassword, '123'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw AuthenticationError for non-existent user', async () => {
            await expect(authService.changePassword(99999, 'oldpass', 'NewPass123'))
                .rejects
                .toThrow(AuthenticationError);
        });

        it('should hash the new password', async () => {
            // Create isolated user for this test
            const isolatedPassword = 'IsolatedPass123';
            const hashedIsolated = await bcrypt.hash(isolatedPassword, 10);
            const isolatedUser = await db.createUser({
                name: 'Isolated Hash Test',
                email: 'isolated.hash@example.com',
                password: hashedIsolated,
                role: 'user'
            });

            const newPassword = 'NewHashedPass789';
            await authService.changePassword(isolatedUser.userId, isolatedPassword, newPassword);

            const user = await db.findUserById(isolatedUser.userId);
            expect(user.password).not.toBe(newPassword); // Should be hashed
            expect(user.password.startsWith('$2')).toBe(true); // bcrypt hash format
        });

        it('should not allow login with old password after change', async () => {
            // Create isolated user for this test
            const isolatedPassword = 'IsolatedOldPass123';
            const hashedIsolated = await bcrypt.hash(isolatedPassword, 10);
            const isolatedUser = await db.createUser({
                name: 'Isolated Old Pass Test',
                email: 'isolated.oldpass@example.com',
                password: hashedIsolated,
                role: 'user'
            });

            const newPassword = 'BrandNewPass999';
            await authService.changePassword(isolatedUser.userId, isolatedPassword, newPassword);

            // Old password should fail
            await expect(authService.loginUser('isolated.oldpass@example.com', isolatedPassword))
                .rejects
                .toThrow(AuthenticationError);

            // New password should work
            const loginResult = await authService.loginUser('isolated.oldpass@example.com', newPassword);
            expect(loginResult).toHaveProperty('token');
        });
    });
});
