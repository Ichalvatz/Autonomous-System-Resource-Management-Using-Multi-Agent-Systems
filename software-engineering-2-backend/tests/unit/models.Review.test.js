/**
 * @fileoverview Review Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import Review from '../../models/Review.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('Review Model', () => {
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
        // Create test reviews with various ratings
        beforeEach(async () => {
            await Review.create({ reviewId: 1, userId: 100, placeId: 200, rating: 5, comment: 'Great' });
            await Review.create({ reviewId: 2, userId: 100, placeId: 201, rating: 4, comment: 'Good' });
            await Review.create({ reviewId: 3, userId: 101, placeId: 200, rating: 3, comment: 'OK' });
            await Review.create({ reviewId: 4, userId: 102, placeId: 200, rating: 2, comment: 'Bad' });
        });

        test('findByPlaceId returns reviews for place sorted by date', async () => {
            const results = await Review.findByPlaceId(200);
            expect(results).toHaveLength(3);
            results.forEach(r => expect(r.placeId).toBe(200));
        });

        test('findByPlaceId returns empty for unknown place', async () => {
            const results = await Review.findByPlaceId(999);
            expect(results).toHaveLength(0);
        });

        test('findByUserId returns reviews by user sorted by date', async () => {
            const results = await Review.findByUserId(100);
            expect(results).toHaveLength(2);
            results.forEach(r => expect(r.userId).toBe(100));
        });

        test('findByUserId returns empty for unknown user', async () => {
            const results = await Review.findByUserId(999);
            expect(results).toHaveLength(0);
        });

        test('getAverageRating calculates average for place', async () => {
            const avg = await Review.getAverageRating(200);
            expect(avg).toBeCloseTo((5 + 3 + 2) / 3, 1);
        });

        test('getAverageRating returns 0 for place with no reviews', async () => {
            const avg = await Review.getAverageRating(999);
            expect(avg).toBe(0);
        });
    });

    describe('Instance Methods', () => {
        test('isOwnedBy returns true for matching userId', async () => {
            const review = await Review.create({
                reviewId: 10, userId: 100, placeId: 200, rating: 5
            });
            expect(review.isOwnedBy(100)).toBe(true);
        });

        test('isOwnedBy returns false for different userId', async () => {
            const review = await Review.create({
                reviewId: 11, userId: 100, placeId: 200, rating: 5
            });
            expect(review.isOwnedBy(999)).toBe(false);
        });

        // Test positive review classification (rating >= 4)
        test('isPositive returns true for rating >= 4', async () => {
            const review4 = await Review.create({ reviewId: 20, userId: 100, placeId: 200, rating: 4 });
            const review5 = await Review.create({ reviewId: 21, userId: 100, placeId: 201, rating: 5 });
            expect(review4.isPositive()).toBe(true);
            expect(review5.isPositive()).toBe(true);
        });

        // Test non-positive review classification
        test('isPositive returns false for rating < 4', async () => {
            const review = await Review.create({
                reviewId: 22, userId: 100, placeId: 200, rating: 3
            });
            expect(review.isPositive()).toBe(false);
        });

        // Test negative review classification (rating <= 2)
        test('isNegative returns true for rating <= 2', async () => {
            const review1 = await Review.create({ reviewId: 30, userId: 100, placeId: 200, rating: 1 });
            const review2 = await Review.create({ reviewId: 31, userId: 100, placeId: 201, rating: 2 });
            expect(review1.isNegative()).toBe(true);
            expect(review2.isNegative()).toBe(true);
        });

        // Test non-negative review classification
        test('isNegative returns false for rating > 2', async () => {
            const review = await Review.create({
                reviewId: 32, userId: 100, placeId: 200, rating: 3
            });
            expect(review.isNegative()).toBe(false);
        });
    });
});
