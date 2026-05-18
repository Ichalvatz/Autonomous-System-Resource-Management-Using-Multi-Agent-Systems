/**
 * @fileoverview Settings Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import Settings from '../../models/Settings.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('Settings Model', () => {
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
        test('findByUserId returns settings for user', async () => {
            await Settings.create({ userId: 100, language: 'en' });
            const result = await Settings.findByUserId(100);
            expect(result).not.toBeNull();
            expect(result.userId).toBe(100);
        });

        test('findByUserId returns null for unknown user', async () => {
            const result = await Settings.findByUserId(999);
            expect(result).toBeNull();
        });

        test('createDefaultForUser creates settings with defaults', async () => {
            const result = await Settings.createDefaultForUser(100);
            expect(result.userId).toBe(100);
            expect(result.language).toBe('el');
            expect(result.emailNotifications).toBe(true);
            expect(result.pushNotifications).toBe(false);
        });

        test('updateForUser updates existing settings', async () => {
            await Settings.create({ userId: 100, language: 'el' });
            const result = await Settings.updateForUser(100, { language: 'en' });
            expect(result.language).toBe('en');
        });

        test('updateForUser creates settings if not exists (upsert)', async () => {
            const result = await Settings.updateForUser(200, { language: 'de' });
            expect(result.userId).toBe(200);
            expect(result.language).toBe('de');
        });
    });

    describe('Instance Methods', () => {
        test('enableEmailNotifications sets to true and saves', async () => {
            const settings = await Settings.create({ userId: 100, emailNotifications: false });
            await settings.enableEmailNotifications();

            const updated = await Settings.findByUserId(100);
            expect(updated.emailNotifications).toBe(true);
        });

        test('disableEmailNotifications sets to false and saves', async () => {
            const settings = await Settings.create({ userId: 101, emailNotifications: true });
            await settings.disableEmailNotifications();

            const updated = await Settings.findByUserId(101);
            expect(updated.emailNotifications).toBe(false);
        });

        // Test language update with valid language code
        test('setLanguage updates to supported language', async () => {
            const settings = await Settings.create({ userId: 102, language: 'el' });
            await settings.setLanguage('en');

            const updated = await Settings.findByUserId(102);
            expect(updated.language).toBe('en');
        });

        // Test language validation for unsupported codes
        test('setLanguage throws for unsupported language', async () => {
            const settings = await Settings.create({ userId: 103, language: 'el' });
            expect(() => settings.setLanguage('invalid')).toThrow('Unsupported language');
        });

        // Test push notification toggle from disabled to enabled
        test('togglePushNotifications toggles from false to true', async () => {
            const settings = await Settings.create({ userId: 104, pushNotifications: false });
            await settings.togglePushNotifications();

            const updated = await Settings.findByUserId(104);
            expect(updated.pushNotifications).toBe(true);
        });

        // Test push notification toggle from enabled to disabled
        test('togglePushNotifications toggles from true to false', async () => {
            const settings = await Settings.create({ userId: 105, pushNotifications: true });
            await settings.togglePushNotifications();

            const updated = await Settings.findByUserId(105);
            expect(updated.pushNotifications).toBe(false);
        });
    });
});
