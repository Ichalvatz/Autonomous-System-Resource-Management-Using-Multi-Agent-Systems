/**
 * @fileoverview Unit Tests for User Service - Profile Operations
 * @module tests/unit/userService.profile.test
 * 
 * Tests user profile service functions: get, update, delete operations.
 * Validates data sanitization (password removal) and email uniqueness.
 */

import * as userService from '../../services/userService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError, ConflictError } from '../../utils/errors.js';

/**
 * Test suite for user profile service operations.
 * Covers getUserProfile, updateUserProfile, deleteUser, getAllUsers.
 */
describe('User Service - Profile Operations', () => {
    let testUser;

    beforeEach(async () => {
        // Create a test user in DB
        testUser = await db.createUser({
            name: 'Test User',
            email: 'testuser@example.com',
            password: 'hashedpassword123',
            role: 'user'
        });
    });

    describe('getUserProfile', () => {
        it('should get user profile by ID', async () => {
            const profile = await userService.getUserProfile(testUser.userId);

            expect(profile).toBeDefined();
            expect(profile.userId).toBe(testUser.userId);
            expect(profile.name).toBe('Test User');
            expect(profile.email).toBe('testuser@example.com');
            expect(profile.password).toBeUndefined(); // Should be sanitized
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(userService.getUserProfile('invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent user', async () => {
            await expect(userService.getUserProfile(99999))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should sanitize user data (no password field)', async () => {
            const profile = await userService.getUserProfile(testUser.userId);

            expect(profile).toHaveProperty('userId');
            expect(profile).toHaveProperty('name');
            expect(profile).toHaveProperty('email');
            expect(profile).not.toHaveProperty('password');
        });
    });

    describe('updateUserProfile', () => {
        it('should update user name successfully', async () => {
            const updates = { name: 'Updated Name' };
            const updated = await userService.updateUserProfile(testUser.userId, updates);

            expect(updated.name).toBe('Updated Name');
            expect(updated.email).toBe(testUser.email);
        });

        it('should update user email successfully', async () => {
            const updates = { email: 'newemail@example.com' };
            const updated = await userService.updateUserProfile(testUser.userId, updates);

            expect(updated.email).toBe('newemail@example.com');
        });

        it('should update multiple fields at once', async () => {
            const updates = {
                name: 'New Name',
                email: 'another@example.com',
                phone: '1234567890'
            };
            const updated = await userService.updateUserProfile(testUser.userId, updates);

            expect(updated.name).toBe('New Name');
            expect(updated.email).toBe('another@example.com');
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(userService.updateUserProfile('invalid', { name: 'Test' }))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent user', async () => {
            await expect(userService.updateUserProfile(99999, { name: 'Test' }))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should throw ValidationError for invalid email format', async () => {
            await expect(userService.updateUserProfile(testUser.userId, { email: 'invalid-email' }))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ConflictError when email is already in use', async () => {
            // Create another user
            await db.createUser({
                name: 'Another User',
                email: 'another@example.com',
                password: 'password123'
            });

            // Try to update testUser with anotherUser's email
            await expect(userService.updateUserProfile(testUser.userId, { email: 'another@example.com' }))
                .rejects
                .toThrow(ConflictError);
        });

        it('should not update disallowed fields like password or role', async () => {
            const updates = {
                name: 'Valid Update',
                password: 'hacked',
                role: 'admin'
            };
            const updated = await userService.updateUserProfile(testUser.userId, updates);

            expect(updated.name).toBe('Valid Update');
            // Password and role should not be updated via updateUserProfile
            const userInDb = await db.findUserById(testUser.userId);
            expect(userInDb.password).toBe(testUser.password); // unchanged
            expect(userInDb.role).toBe(testUser.role); // unchanged
        });
    });

    describe('deleteUser', () => {
        it('should delete user successfully', async () => {
            const result = await userService.deleteUser(testUser.userId);

            expect(result).toBe(true);

            // Verify user is deleted
            await expect(userService.getUserProfile(testUser.userId))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(userService.deleteUser('invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent user', async () => {
            await expect(userService.deleteUser(99999))
                .rejects
                .toThrow(NotFoundError);
        });
    });

    describe('getAllUsers', () => {
        it('should get all users with sanitized data', async () => {
            await db.createUser({
                name: 'User 2',
                email: 'user2@example.com',
                password: 'password123'
            });

            const users = await userService.getAllUsers();

            expect(Array.isArray(users)).toBe(true);
            expect(users.length).toBeGreaterThan(0);

            // Check that passwords are sanitized
            users.forEach(user => {
                expect(user).not.toHaveProperty('password');
                expect(user).toHaveProperty('userId');
                expect(user).toHaveProperty('email');
            });
        });
    });
});
