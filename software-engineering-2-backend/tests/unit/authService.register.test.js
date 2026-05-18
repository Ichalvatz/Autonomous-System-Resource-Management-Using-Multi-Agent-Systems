/**
 * @fileoverview Unit Tests for Authentication Service - Registration
 * @description This test suite validates the user registration functionality including
 * password hashing, email normalization, input validation, and conflict handling.
 * 
 * @module tests/unit/authService.register.test
 * @requires ../../services/authService
 * @requires ../../config/db
 * @requires ../../utils/errors
 */

import * as authService from '../../services/authService.js';
import db from '../../config/db.js';
import bcrypt from 'bcryptjs';
import { ValidationError, ConflictError } from '../../utils/errors.js';

/**
 * Auth Service - Registration Test Suite
 * @description Tests for user registration with validation.
 */
describe('Auth Service - Registration', () => {
    const originalEnv = process.env.JWT_SECRET;
    let hashedPassword;

    beforeAll(() => {
        process.env.JWT_SECRET = 'test-secret-key-for-testing';
    });

    afterAll(() => {
        process.env.JWT_SECRET = originalEnv;
    });

    beforeEach(async () => {
        // Hash password and create test user
        hashedPassword = await bcrypt.hash('SecurePass123', 10);
        await db.createUser({
            name: 'Auth Test User',
            email: 'auth@example.com',
            password: hashedPassword,
            role: 'user'
        });
    });

    describe('registerUser', () => {
        it('should register a new user successfully', async () => {
            const userData = {
                name: 'New User',
                email: 'newuser@example.com',
                password: 'ValidPass123'
            };

            const result = await authService.registerUser(userData);

            expect(result).toHaveProperty('token');
            expect(result).toHaveProperty('user');
            expect(result.user.email).toBe('newuser@example.com');
            expect(result.user.name).toBe('New User');
            expect(result.user.password).toBeUndefined(); // Sanitized
        });

        it('should hash the password before storing', async () => {
            const userData = {
                name: 'Password Test',
                email: 'passtest@example.com',
                password: 'MyPassword123'
            };

            await authService.registerUser(userData);

            const user = await db.findUserByEmail('passtest@example.com');
            expect(user.password).not.toBe('MyPassword123'); // Should be hashed
            expect(user.password.startsWith('$2')).toBe(true); // bcrypt hash format
        });

        it('should convert email to lowercase', async () => {
            const userData = {
                name: 'Case Test',
                email: 'UPPERCASE@EXAMPLE.COM',
                password: 'ValidPass123'
            };

            const result = await authService.registerUser(userData);

            expect(result.user.email).toBe('uppercase@example.com');
        });

        it('should throw ValidationError when name is missing', async () => {
            const userData = {
                email: 'test@example.com',
                password: 'ValidPass123'
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError when email is missing', async () => {
            const userData = {
                name: 'Test User',
                password: 'ValidPass123'
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError when password is missing', async () => {
            const userData = {
                name: 'Test User',
                email: 'test@example.com'
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid email format', async () => {
            const userData = {
                name: 'Test User',
                email: 'invalid-email',
                password: 'ValidPass123'
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for weak password', async () => {
            const userData = {
                name: 'Test User',
                email: 'test@example.com',
                password: '123' // Too short
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ConflictError when email already exists', async () => {
            const userData = {
                name: 'Duplicate User',
                email: 'auth@example.com', // Already exists from beforeEach
                password: 'ValidPass123'
            };

            await expect(authService.registerUser(userData))
                .rejects
                .toThrow(ConflictError);
        });

        it('should assign default role as "user"', async () => {
            const userData = {
                name: 'Role Test',
                email: 'roletest@example.com',
                password: 'ValidPass123'
            };

            await authService.registerUser(userData);

            const user = await db.findUserByEmail('roletest@example.com');
            expect(user.role).toBe('user');
        });
    });
});
