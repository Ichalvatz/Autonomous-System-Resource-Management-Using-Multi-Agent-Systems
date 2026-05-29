/**
 * @fileoverview PreferenceProfile Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import PreferenceProfile from '../../models/PreferenceProfile.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('PreferenceProfile Model', () => {
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
        // Create test profiles with active/inactive states
        beforeEach(async () => {
            await PreferenceProfile.create({
                profileId: 1, userId: 100, name: 'Default',
                categories: ['Food', 'Culture'], tags: ['outdoor'], isActive: true
            });
            await PreferenceProfile.create({
                profileId: 2, userId: 100, name: 'Weekend',
                categories: ['Entertainment'], tags: ['indoor'], isActive: false
            });
            await PreferenceProfile.create({
                profileId: 3, userId: 101, name: 'Work',
                categories: ['Business'], tags: [], isActive: true
            });
        });

        test('findByUserId returns all profiles for user', async () => {
            const results = await PreferenceProfile.findByUserId(100);
            expect(results).toHaveLength(2);
        });

        test('findByUserId returns empty for unknown user', async () => {
            const results = await PreferenceProfile.findByUserId(999);
            expect(results).toHaveLength(0);
        });

        test('findActiveByUserId returns active profile', async () => {
            const result = await PreferenceProfile.findActiveByUserId(100);
            expect(result).not.toBeNull();
            expect(result.isActive).toBe(true);
            expect(result.name).toBe('Default');
        });

        test('findActiveByUserId returns null when no active profile', async () => {
            await PreferenceProfile.updateMany({ userId: 100 }, { isActive: false });
            const result = await PreferenceProfile.findActiveByUserId(100);
            expect(result).toBeNull();
        });

        test('deactivateAllForUser sets all profiles to inactive', async () => {
            await PreferenceProfile.deactivateAllForUser(100);
            const profiles = await PreferenceProfile.findByUserId(100);
            profiles.forEach(p => expect(p.isActive).toBe(false));
        });
    });

    describe('Instance Methods', () => {
        test('activate sets profile to active and saves', async () => {
            const profile = await PreferenceProfile.create({
                profileId: 10, userId: 100, name: 'Test', isActive: false
            });
            await profile.activate();

            const updated = await PreferenceProfile.findOne({ profileId: 10 });
            expect(updated.isActive).toBe(true);
        });

        // Test category membership check
        test('hasCategory returns true for existing category', async () => {
            const profile = await PreferenceProfile.create({
                profileId: 20, userId: 100, name: 'Test',
                categories: ['Food', 'Culture']
            });
            expect(profile.hasCategory('Food')).toBe(true);
        });

        // Test category check for non-existent category
        test('hasCategory returns false for missing category', async () => {
            const profile = await PreferenceProfile.create({
                profileId: 21, userId: 100, name: 'Test',
                categories: ['Food']
            });
            expect(profile.hasCategory('Culture')).toBe(false);
        });

        // Test tag membership check
        test('hasTag returns true for existing tag', async () => {
            const profile = await PreferenceProfile.create({
                profileId: 30, userId: 100, name: 'Test',
                tags: ['outdoor', 'family']
            });
            expect(profile.hasTag('outdoor')).toBe(true);
        });

        // Test tag check for non-existent tag
        test('hasTag returns false for missing tag', async () => {
            const profile = await PreferenceProfile.create({
                profileId: 31, userId: 100, name: 'Test',
                tags: ['indoor']
            });
            expect(profile.hasTag('outdoor')).toBe(false);
        });
    });
});
