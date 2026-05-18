/**
 * @fileoverview MongoDB Unit Tests - User Operations
 * @module tests/unit/mongoDb.user.test
 * 
 * Tests MongoDB user data layer: user creation, email lookup, and settings.
 * Uses in-memory MongoDB for fast, isolated test execution.
 */

import mongoDb from '../../config/mongoDb.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

/**
 * Test suite for MongoDB user operations.
 * Covers createUser, findUserByEmail, and user settings management.
 */
describe('MongoDB User Operations', () => {
    beforeAll(async () => {
        await setupMongoDb();
    });

    afterAll(async () => {
        await teardownMongoDb();
    });

    beforeEach(async () => {
        await clearMongoDbData();
    });


    describe('User Operations', () => {
        test('should create a new user with valid data', async () => {
            const userData = {
                name: 'Alice',
                email: 'alice@example.com',
                password: 'secret123'
            };

            const user = await mongoDb.createUser(userData);

            expect(user).toBeDefined();
            expect(user).toHaveProperty('userId');
            expect(user.name).toBe(userData.name);
            expect(user.email).toBe(userData.email);
            expect(typeof user.userId).toBe('number');
        });

        test('should find user by email', async () => {
            const email = 'alice@example.com';
            await mongoDb.createUser({
                name: 'Alice',
                email,
                password: 'secret123'
            });

            const found = await mongoDb.findUserByEmail(email);

            expect(found).not.toBeNull();
            expect(found.email).toBe(email);
        });

        test('should return null when user email not found', async () => {
            const found = await mongoDb.findUserByEmail('nonexistent@example.com');
            expect(found).toBeNull();
        });
    });

    describe('Settings Operations', () => {
        let testUser;

        beforeEach(async () => {
            testUser = await mongoDb.createUser({
                name: 'Eve',
                email: 'eve@example.com',
                password: 'secure123'
            });
        });

        test('should create default settings for new user', async () => {
            const settings = await mongoDb.getSettings(testUser.userId);

            expect(settings).toBeDefined();
            expect(settings).toHaveProperty('userId', testUser.userId);
            expect(settings).toHaveProperty('language');
        });

        test('should update user settings', async () => {
            const updated = await mongoDb.updateSettings(testUser.userId, {
                language: 'GREEK'
            });

            expect(updated).toBeDefined();
            expect(updated).toHaveProperty('language', 'GREEK');
        });

        test('should persist settings changes', async () => {
            await mongoDb.updateSettings(testUser.userId, { language: 'GREEK' });

            const settings = await mongoDb.getSettings(testUser.userId);
            expect(settings.language).toBe('GREEK');
        });
    });
});
