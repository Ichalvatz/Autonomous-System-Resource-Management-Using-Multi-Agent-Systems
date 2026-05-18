/**
 * @fileoverview Unit Tests for Preference Service - Mutations
 * @module tests/unit/preferenceService.mutations.test
 * 
 * Tests preference profile mutation operations: update and delete.
 * Validates ID formats in input and proper NotFoundError handling.
 */

import * as preferenceService from '../../services/preferenceService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Test suite for preference profile mutation operations.
 * Tests updatePreferenceProfile and deletePreferenceProfile functions.
 */
describe('Preference Service - Mutations', () => {
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

    describe('updatePreferenceProfile', () => {
        it('should update preference profile successfully', async () => {
            const profile = await preferenceService.createPreferenceProfile(testUserId, {
                name: 'Original',
                maxDistance: 5
            });

            const updateData = { name: 'Updated Profile', maxDistance: 15 };
            const result = await preferenceService.updatePreferenceProfile(testUserId, profile.profileId, updateData);

            expect(result.name).toBe('Updated Profile');
            expect(result.maxDistance).toBe(15);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(preferenceService.updatePreferenceProfile('invalid', '507f1f77bcf86cd799439011', {}))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid profile ID', async () => {
            await expect(preferenceService.updatePreferenceProfile(testUserId, 'invalid', {}))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent profile', async () => {
            await expect(preferenceService.updatePreferenceProfile(testUserId, '507f1f77bcf86cd799439011', { name: 'Test' }))
                .rejects
                .toThrow(NotFoundError);
        });
    });

    describe('deletePreferenceProfile', () => {
        it('should delete preference profile successfully', async () => {
            const profile = await preferenceService.createPreferenceProfile(testUserId, {
                name: 'To Delete'
            });

            const result = await preferenceService.deletePreferenceProfile(testUserId, profile.profileId);

            expect(result).toBeDefined();

            // Verify it's deleted
            await expect(preferenceService.getPreferenceProfile(testUserId, profile.profileId))
                .rejects
                .toThrow(NotFoundError);
        });

        it('should throw ValidationError for invalid user ID', async () => {
            await expect(preferenceService.deletePreferenceProfile('invalid', '507f1f77bcf86cd799439011'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid profile ID', async () => {
            await expect(preferenceService.deletePreferenceProfile(testUserId, 'invalid'))
                .rejects
                .toThrow(ValidationError);
        });

        it('should throw NotFoundError for non-existent profile', async () => {
            await expect(preferenceService.deletePreferenceProfile(testUserId, '507f1f77bcf86cd799439011'))
                .rejects
                .toThrow(NotFoundError);
        });
    });
});
