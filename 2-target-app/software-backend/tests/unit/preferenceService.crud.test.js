/**
 * @fileoverview Unit Tests for Preference Service - CRUD Operations
 * @module tests/unit/preferenceService.crud.test
 * 
 * Tests preference profile CRUD: create, read, update operations.
 * Validates ID formats in input and proper NotFoundError handling.
 */

import * as preferenceService from '../../services/preferenceService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Test suite for preference profile CRUD operations.
 * Tests createPreferenceProfile, getPreferenceProfiles, getPreferenceProfile.
 */
describe('Preference Service - CRUD Operations', () => {
    let testUserId;

    // Create test user to own the preference profiles
    beforeEach(async () => {
        const user = await db.createUser({
            username: 'prefuser',
            email: 'pref@example.com',
            password: 'hashedpassword123'
        });
        testUserId = user.userId;
    });

    describe('createPreferenceProfile', () => {
        it('should create preference profile successfully', async () => {
            const profileData = {
                name: 'Weekend Explorer',
                categories: ['Museum', 'Park'],
                maxDistance: 10,
                minRating: 4.0
            };

            const result = await preferenceService.createPreferenceProfile(testUserId, profileData);

            expect(result).toBeDefined();
            expect(result.name).toBe(profileData.name);
            expect(result.categories).toEqual(profileData.categories);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(preferenceService.createPreferenceProfile('invalid', { name: 'Test' }))
                .rejects
                .toThrow(ValidationError);
        });

        it('should create profile with minimal data', async () => {
            const minimalProfile = { name: 'Basic Profile' };

            const result = await preferenceService.createPreferenceProfile(testUserId, minimalProfile);

            expect(result).toBeDefined();
            expect(result.name).toBe('Basic Profile');
        });
    });

    describe('getPreferenceProfiles', () => {
        it('should get all user preference profiles', async () => {
            await preferenceService.createPreferenceProfile(testUserId, { name: 'Profile 1' });
            await preferenceService.createPreferenceProfile(testUserId, { name: 'Profile 2' });

            const result = await preferenceService.getPreferenceProfiles(testUserId);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(preferenceService.getPreferenceProfiles('invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should return empty array for user with no profiles', async () => {
            const result = await preferenceService.getPreferenceProfiles(testUserId);

            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('getPreferenceProfile', () => {
        it('should get specific preference profile', async () => {
            const created = await preferenceService.createPreferenceProfile(testUserId, {
                name: 'My Profile'
            });

            const result = await preferenceService.getPreferenceProfile(testUserId, created.profileId);

            expect(result).toBeDefined();
            expect(result.profileId).toBe(created.profileId);
            expect(result.name).toBe('My Profile');
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(preferenceService.getPreferenceProfile('invalid', '507f1f77bcf86cd799439011'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid profile ID', async () => {
            await expect(preferenceService.getPreferenceProfile(testUserId, 'invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent profile', async () => {
            await expect(preferenceService.getPreferenceProfile(testUserId, '507f1f77bcf86cd799439011'))
                .rejects
                .toThrow(NotFoundError);
        });
    });
});
