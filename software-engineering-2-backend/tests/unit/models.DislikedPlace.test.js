/**
 * @fileoverview DislikedPlace Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import DislikedPlace from '../../models/DislikedPlace.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('DislikedPlace Model', () => {
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
        // Create test disliked places for different users
        beforeEach(async () => {
            await DislikedPlace.create({ dislikedId: 1, userId: 100, placeId: 200 });
            await DislikedPlace.create({ dislikedId: 2, userId: 100, placeId: 201 });
            await DislikedPlace.create({ dislikedId: 3, userId: 101, placeId: 200 });
        });

        test('findByUserId returns disliked places for user', async () => {
            const results = await DislikedPlace.findByUserId(100);
            expect(results).toHaveLength(2);
            expect(results[0].userId).toBe(100);
        });

        test('findByUserId returns empty array for unknown user', async () => {
            const results = await DislikedPlace.findByUserId(999);
            expect(results).toHaveLength(0);
        });

        test('findByPlaceId returns disliked entries for place', async () => {
            const results = await DislikedPlace.findByPlaceId(200);
            expect(results).toHaveLength(2);
        });

        test('findByPlaceId returns empty array for unknown place', async () => {
            const results = await DislikedPlace.findByPlaceId(999);
            expect(results).toHaveLength(0);
        });

        test('removeByUserAndPlace deletes matching entry', async () => {
            const removed = await DislikedPlace.removeByUserAndPlace(100, 200);
            expect(removed).not.toBeNull();
            expect(removed.userId).toBe(100);
            expect(removed.placeId).toBe(200);

            const remaining = await DislikedPlace.findByUserId(100);
            expect(remaining).toHaveLength(1);
        });

        test('removeByUserAndPlace returns null when not found', async () => {
            const removed = await DislikedPlace.removeByUserAndPlace(999, 999);
            expect(removed).toBeNull();
        });
    });

    describe('Instance Methods', () => {
        test('isOwnedBy returns true for matching userId', async () => {
            const disliked = await DislikedPlace.create({ dislikedId: 10, userId: 100, placeId: 200 });
            expect(disliked.isOwnedBy(100)).toBe(true);
        });

        test('isOwnedBy returns false for different userId', async () => {
            const disliked = await DislikedPlace.create({ dislikedId: 11, userId: 100, placeId: 200 });
            expect(disliked.isOwnedBy(999)).toBe(false);
        });
    });
});
