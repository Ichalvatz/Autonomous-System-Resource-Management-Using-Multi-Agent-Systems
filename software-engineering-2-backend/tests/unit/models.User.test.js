/**
 * @fileoverview User Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import User from '../../models/User.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('User Model', () => {
    // Initialize test database connection
    beforeAll(async () => {
        await setupMongoDb();
    });

    // Clean up database connection
    afterAll(async () => {
        await teardownMongoDb();
    });

    // Clear data between tests for isolation
    beforeEach(async () => {
        await clearMongoDbData();
    });

    describe('Static Methods', () => {
        // Create test users with different roles and attributes
        beforeEach(async () => {
            await User.create({
                userId: 1, name: 'Admin User', email: 'admin@example.com',
                password: 'hash123', role: 'admin'
            });
            await User.create({
                userId: 2, name: 'Regular User', email: 'user@example.com',
                password: 'hash456', role: 'user',
                preferences: { categories: ['Food', 'Culture'], tags: ['outdoor'] },
                location: { latitude: 37.9838, longitude: 23.7275 }
            });
            await User.create({
                userId: 3, name: 'Another User', email: 'another@example.com',
                password: 'hash789', role: 'user'
            });
        });

        test('findByEmail returns user with matching email', async () => {
            const result = await User.findByEmail('user@example.com');
            expect(result).not.toBeNull();
            expect(result.name).toBe('Regular User');
        });

        test('findByEmail is case insensitive', async () => {
            const result = await User.findByEmail('USER@EXAMPLE.COM');
            expect(result).not.toBeNull();
            expect(result.name).toBe('Regular User');
        });

        test('findByEmail returns null for unknown email', async () => {
            const result = await User.findByEmail('unknown@example.com');
            expect(result).toBeNull();
        });

        test('findAdmins returns only admin users', async () => {
            const results = await User.findAdmins();
            expect(results).toHaveLength(1);
            expect(results[0].role).toBe('admin');
        });

        test('findUsers returns only regular users', async () => {
            const results = await User.findUsers();
            expect(results).toHaveLength(2);
            results.forEach(u => expect(u.role).toBe('user'));
        });
    });

    describe('Instance Methods', () => {
        test('isAdmin returns true for admin role', async () => {
            const user = await User.create({
                userId: 10, name: 'Admin', email: 'admin2@test.com',
                password: 'hash', role: 'admin'
            });
            expect(user.isAdmin()).toBe(true);
        });

        test('isAdmin returns false for user role', async () => {
            const user = await User.create({
                userId: 11, name: 'User', email: 'user2@test.com',
                password: 'hash', role: 'user'
            });
            expect(user.isAdmin()).toBe(false);
        });

        test('hasLocation returns true when location is set', async () => {
            const user = await User.create({
                userId: 20, name: 'Located', email: 'located@test.com',
                password: 'hash', location: { latitude: 37.9838, longitude: 23.7275 }
            });
            expect(user.hasLocation()).toBe(true);
        });

        // Test location validation with missing coordinates
        test('hasLocation returns false when location is missing', async () => {
            const user = await User.create({
                userId: 21, name: 'No Location', email: 'noloc@test.com',
                password: 'hash'
            });
            expect(user.hasLocation()).toBe(false);
        });

        // Test location validation with incomplete data
        test('hasLocation returns false for partial location', async () => {
            const user = await User.create({
                userId: 22, name: 'Partial', email: 'partial@test.com',
                password: 'hash', location: { latitude: 37.9838 }
            });
            expect(user.hasLocation()).toBe(false);
        });

        // Test preference checking for existing category
        test('hasPreference returns true for existing category', async () => {
            const user = await User.create({
                userId: 30, name: 'Prefs', email: 'prefs@test.com',
                password: 'hash', preferences: { categories: ['Food', 'Culture'] }
            });
            expect(user.hasPreference('Food')).toBe(true);
        });

        // Test preference checking for non-existent category
        test('hasPreference returns false for missing category', async () => {
            const user = await User.create({
                userId: 31, name: 'Prefs2', email: 'prefs2@test.com',
                password: 'hash', preferences: { categories: ['Food'] }
            });
            expect(user.hasPreference('Entertainment')).toBe(false);
        });

        // Test preference checking when no preferences defined
        test('hasPreference returns false when no preferences', async () => {
            const user = await User.create({
                userId: 32, name: 'NoPrefs', email: 'noprefs@test.com',
                password: 'hash'
            });
            expect(user.hasPreference('Food')).toBe(false);
        });

        // Test active profile assignment
        test('setActiveProfile updates activeProfile and saves', async () => {
            const user = await User.create({
                userId: 40, name: 'Profile', email: 'profile@test.com',
                password: 'hash'
            });
            await user.setActiveProfile(5);

            const updated = await User.findOne({ userId: 40 });
            expect(updated.activeProfile).toBe(5);
        });
    });
});
