/**
 * @fileoverview Unit Tests for User Service - Settings Operations
 * @module tests/unit/userService.settings.test
 * 
 * Tests user settings management including language preferences,
 * notifications, accessibility settings, and privacy options.
 */

import * as userService from '../../services/userService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Test suite for user settings service functions.
 * Covers getUserSettings and updateUserSettings operations.
 */
describe('User Service - Settings Operations', () => {
    let testUser;

    // Create fresh test user before each test
    beforeEach(async () => {
        // Create a test user in DB
        testUser = await db.createUser({
            name: 'Test User',
            email: 'testuser@example.com',
            password: 'hashedpassword123',
            role: 'user'
        });
    });

    describe('getUserSettings', () => {
        it('should get user settings', async () => {
            const settings = await userService.getUserSettings(testUser.userId);

            expect(settings).toBeDefined();
            expect(settings.userId).toBe(testUser.userId);
            expect(settings).toHaveProperty('preferredLanguage');
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(userService.getUserSettings('invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent user', async () => {
            await expect(userService.getUserSettings(99999))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should return default settings if none exist', async () => {
            const settings = await userService.getUserSettings(testUser.userId);

            expect(settings.preferredLanguage).toBe('ENGLISH');
            expect(Array.isArray(settings.accessibilitySettings)).toBe(true);
        });
    });

    describe('updateUserSettings', () => {
        it('should update preferred language', async () => {
            const updates = { preferredLanguage: 'GREEK' };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.preferredLanguage).toBe('GREEK');
        });

        it('should update notification preferences', async () => {
            const updates = {
                emailNotifications: true,
                pushNotifications: false
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.emailNotifications).toBe(true);
            expect(updated.pushNotifications).toBe(false);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(userService.updateUserSettings('invalid', {}))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent user', async () => {
            await expect(userService.updateUserSettings(99999, {}))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should update accessibility settings', async () => {
            const updates = {
                accessibilitySettings: ['HIGH_CONTRAST', 'LARGE_TEXT']
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.accessibilitySettings).toEqual(['HIGH_CONTRAST', 'LARGE_TEXT']);
        });

        it('should update privacy settings', async () => {
            const updates = {
                privacySettings: ['HIDE_EMAIL', 'HIDE_LOCATION']
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.privacySettings).toEqual(['HIDE_EMAIL', 'HIDE_LOCATION']);
        });

        it('should update user agreement accepted flag', async () => {
            const updates = {
                userAgreementAccepted: true
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.userAgreementAccepted).toBe(true);
        });

        it('should update language setting', async () => {
            const updates = {
                language: 'el'
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.language).toBe('el');
        });

        it('should update multiple settings at once', async () => {
            const updates = {
                preferredLanguage: 'GREEK',
                emailNotifications: true,
                pushNotifications: false,
                accessibilitySettings: ['HIGH_CONTRAST'],
                privacySettings: ['HIDE_LOCATION'],
                userAgreementAccepted: true
            };
            const updated = await userService.updateUserSettings(testUser.userId, updates);

            expect(updated.preferredLanguage).toBe('GREEK');
            expect(updated.emailNotifications).toBe(true);
            expect(updated.pushNotifications).toBe(false);
            expect(updated.accessibilitySettings).toEqual(['HIGH_CONTRAST']);
            expect(updated.privacySettings).toEqual(['HIDE_LOCATION']);
            expect(updated.userAgreementAccepted).toBe(true);
        });
    });
});
