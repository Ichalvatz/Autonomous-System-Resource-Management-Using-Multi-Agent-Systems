/**
 * @fileoverview Integration Tests for Recommendation Controller - Happy Path
 * @description This test suite validates successful recommendation scenarios including
 * preference matching, category filtering, disliked exclusion, and sorting.
 * 
 * @module tests/integration/recommendation.happy.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

// --- Test Helpers ---

/** Setup user with a preference profile */
const setupUserWithProfile = async (profileName, categories) => {
    const { user, token } = await createAuthenticatedUser();
    await db.addPreferenceProfile({ userId: user.userId, name: profileName, categories });
    return { user, token };
};

/** Create a test place with sensible defaults */
const createTestPlace = (overrides = {}) => db.createPlace({
    name: 'Test Place',
    category: 'MUSEUM',
    description: 'Test description',
    city: 'Athens',
    rating: 4.5,
    ...overrides
});

/** Get recommendation for user */
const getRecommendations = (token, userId) => authRequest(token).get(`/users/${userId}/recommendations`);

/** Extract place IDs from response */
const getPlaceIds = (response) => response.body.data.recommendations.map(r => r.placeId);

// --- Test Suite ---

describe('Recommendation Controller - Happy Path Tests', () => {
    describe('GET /users/:userId/recommendations', () => {
        it('should return 200 and empty array without preference profile', async () => {
            const { user, token } = await createAuthenticatedUser();
            const response = await getRecommendations(token, user.userId);
            expect(response.status).toBe(200);
            expect(response.body.data.recommendations).toEqual([]);
        });

        it('should return places matching user preferences', async () => {
            const { user, token } = await setupUserWithProfile('Museum Lover', ['MUSEUM']);
            const museum = await createTestPlace({ name: 'Test Museum', category: 'MUSEUM' });
            await createTestPlace({ name: 'Paradise Beach', category: 'BEACH' });

            const response = await getRecommendations(token, user.userId);
            expect(response.status).toBe(200);
            expect(getPlaceIds(response)).toContain(museum.placeId);
        });

        it('should filter multiple categories', async () => {
            const { user, token } = await setupUserWithProfile('Night & Shopping', ['NIGHTLIFE', 'SHOPPING']);
            const nightclub = await createTestPlace({ name: 'Athens Nightclub', category: 'NIGHTLIFE', rating: 4.7 });
            const mall = await createTestPlace({ name: 'Shopping Mall', category: 'SHOPPING', rating: 4.6 });
            await createTestPlace({ name: 'Olympic Stadium', category: 'SPORTS' });

            const placeIds = getPlaceIds(await getRecommendations(token, user.userId));
            expect(placeIds).toContain(nightclub.placeId);
            expect(placeIds).toContain(mall.placeId);
        });

        it('should exclude disliked places', async () => {
            const { user, token } = await setupUserWithProfile('Park Profile', ['PARK']);
            const park1 = await createTestPlace({ name: 'Central Park', category: 'PARK', rating: 4.8 });
            const park2 = await createTestPlace({ name: 'National Garden', category: 'PARK', rating: 4.5 });
            await db.addDislikedPlace(user.userId, park1.placeId);

            const placeIds = getPlaceIds(await getRecommendations(token, user.userId));
            expect(placeIds).toContain(park2.placeId);
            expect(placeIds).not.toContain(park1.placeId);
        });

        it('should sort places by rating', async () => {
            const { user, token } = await setupUserWithProfile('Beach Lover', ['BEACH']);
            await createTestPlace({ name: 'Low Beach', category: 'BEACH', rating: 3.5 });
            await createTestPlace({ name: 'High Beach', category: 'BEACH', rating: 4.9 });
            await createTestPlace({ name: 'Med Beach', category: 'BEACH', rating: 4.2 });

            const ratings = (await getRecommendations(token, user.userId)).body.data.recommendations.map(r => r.rating);
            expect(ratings[0]).toBeGreaterThanOrEqual(ratings[1]);
        });

        it('should return up to 10 recommendations', async () => {
            const { user, token } = await setupUserWithProfile('Park Lover', ['PARK']);

            // Batch creation with Promise.all for better performance
            const promises = Array.from({ length: 15 }, (_, i) =>
                createTestPlace({ name: `Park ${i}`, category: 'PARK', rating: 4.0 + (i * 0.01) })
            );
            await Promise.all(promises);

            const response = await getRecommendations(token, user.userId);
            expect(response.body.data.recommendations.length).toBeLessThanOrEqual(10);
        });

        it('should contain reviews for each place', async () => {
            const { user, token } = await setupUserWithProfile('Culture', ['CULTURE']);
            const place = await createTestPlace({ name: 'Cultural Center', category: 'CULTURE' });
            await db.addReview({ userId: user.userId, placeId: place.placeId, rating: 5, comment: 'Great!' });

            const response = await getRecommendations(token, user.userId);
            const placeWithReview = response.body.data.recommendations.find(p => p.placeId === place.placeId);
            expect(placeWithReview.reviews).toHaveLength(1);
        });

        it('should contain HATEOAS links', async () => {
            const { user, token } = await setupUserWithProfile('Test', ['MUSEUM']);
            await createTestPlace({ name: 'Test Museum', category: 'MUSEUM' });

            const response = await getRecommendations(token, user.userId);
            expect(response.body.data).toHaveProperty('links');
        });

        it('should return activeProfile name', async () => {
            const { user, token } = await setupUserWithProfile('My Active Profile', ['NIGHTLIFE']);
            await createTestPlace({ name: 'Test Club', category: 'NIGHTLIFE' });

            const response = await getRecommendations(token, user.userId);
            expect(response.body.data.activeProfile).toBe('My Active Profile');
        });

        it('should use most recent profile if no active', async () => {
            const { user, token } = await createAuthenticatedUser();
            await db.addPreferenceProfile({ userId: user.userId, name: 'Old Profile', categories: ['BEACH'] });
            await db.addPreferenceProfile({ userId: user.userId, name: 'Recent Profile', categories: ['SPORTS'] });
            await createTestPlace({ name: 'Test Stadium', category: 'SPORTS' });

            const response = await getRecommendations(token, user.userId);
            expect(response.body.data.activeProfile).toBe('Recent Profile');
        });
    });
});

