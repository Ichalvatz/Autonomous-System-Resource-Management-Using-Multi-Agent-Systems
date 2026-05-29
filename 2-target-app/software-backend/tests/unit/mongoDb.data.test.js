/**
 * @fileoverview MongoDB Unit Tests - Data Operations
 * @module tests/unit/mongoDb.data.test
 * 
 * Tests MongoDB data layer operations including reviews and favourites.
 * Uses in-memory MongoDB for isolated testing without external dependencies.
 */

import mongoDb from '../../config/mongoDb.js';
import models from '../../models/index.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

/**
 * Test suite for MongoDB data operations.
 * Covers review CRUD and favourite place management.
 */
describe('MongoDB Data Operations', () => {
    // Initialize in-memory MongoDB before tests
    beforeAll(async () => {
        await setupMongoDb();
    });

    // Clean up MongoDB connection after tests
    afterAll(async () => {
        await teardownMongoDb();
    });

    // Reset data state before each test for isolation
    beforeEach(async () => {
        await clearMongoDbData();
    });


    // Tests for adding and retrieving place reviews
    describe('Review Operations', () => {
        let testUser;
        let testPlace;

        beforeEach(async () => {
            testUser = await mongoDb.createUser({
                name: 'Bob',
                email: 'bob@example.com',
                password: 'password123'
            });
            testPlace = await models.Place.create({
                placeId: 1,
                name: 'Test Cafe',
                category: 'Food'
            });
        });

        test('should add a review for a place', async () => {
            const reviewData = {
                userId: testUser.userId,
                placeId: testPlace.placeId,
                rating: 5,
                comment: 'Great place!'
            };

            const review = await mongoDb.addReview(reviewData);

            expect(review).toBeDefined();
            expect(review).toHaveProperty('reviewId');
            expect(review.rating).toBe(5);
            expect(review.comment).toBe('Great place!');
        });

        test('should retrieve all reviews for a place', async () => {
            await mongoDb.addReview({
                userId: testUser.userId,
                placeId: testPlace.placeId,
                rating: 5,
                comment: 'Great'
            });
            await mongoDb.addReview({
                userId: testUser.userId,
                placeId: testPlace.placeId,
                rating: 4,
                comment: 'Good'
            });

            const reviews = await mongoDb.getReviewsForPlace(testPlace.placeId);

            expect(Array.isArray(reviews)).toBe(true);
            expect(reviews).toHaveLength(2);
            expect(reviews[0]).toHaveProperty('rating');
            expect(reviews[0]).toHaveProperty('comment');
        });

        test('should return empty array when place has no reviews', async () => {
            const reviews = await mongoDb.getReviewsForPlace(999);
            expect(Array.isArray(reviews)).toBe(true);
            expect(reviews).toHaveLength(0);
        });
    });

    describe('Favourite Operations', () => {
        let testUser;
        let testPlace;

        beforeEach(async () => {
            testUser = await mongoDb.createUser({
                name: 'Dan',
                email: 'dan@example.com',
                password: 'pass123'
            });
            testPlace = await models.Place.create({
                placeId: 2,
                name: 'Diner',
                category: 'Food'
            });
        });

        test('should add a favourite place', async () => {
            const fav = await mongoDb.addFavouritePlace(testUser.userId, testPlace.placeId);

            expect(fav).toBeDefined();
            expect(fav).toHaveProperty('favouriteId');
        });

        test('should prevent duplicate favourites', async () => {
            await mongoDb.addFavouritePlace(testUser.userId, testPlace.placeId);
            const duplicate = await mongoDb.addFavouritePlace(testUser.userId, testPlace.placeId);

            expect(duplicate).toBeNull();
        });

        test('should retrieve user favourite places with populated data', async () => {
            await mongoDb.addFavouritePlace(testUser.userId, testPlace.placeId);

            const favourites = await mongoDb.getFavouritePlaces(testUser.userId);

            expect(Array.isArray(favourites)).toBe(true);
            expect(favourites).toHaveLength(1);
            expect(favourites[0]).toHaveProperty('place');
            expect(favourites[0].place).toHaveProperty('placeId', testPlace.placeId);
            expect(favourites[0].place.name).toBe('Diner');
        });

        test('should return empty array when user has no favourites', async () => {
            const favourites = await mongoDb.getFavouritePlaces(testUser.userId);
            expect(Array.isArray(favourites)).toBe(true);
            expect(favourites).toHaveLength(0);
        });
    });
});
