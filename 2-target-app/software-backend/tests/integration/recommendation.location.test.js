/**
 * @fileoverview Integration Tests for Recommendation Controller - Location & Edge Cases
 * @module tests/integration/recommendation.location.test 
 * Testing Strategy:
 * - Integration Tests using In-Memory Database
 * - Cover location-based recommendations and edge cases
 * 
 * Endpoint we are testing:
 * - GET /users/:userId/recommendations - Retrieve recommendations based on preferences
 */

import { createAuthenticatedUser, authRequest } from '../helpers/testUtils.js';
import db from '../../config/db.js';

describe('Recommendation Controller - Location & Edge Cases', () => {

    describe('GET /users/:userId/recommendations', () => {
        describe('Happy Path - Location-Based Recommendations', () => {
            it('should sort places by distance when location is provided', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Restaurant Profile',
                    categories: ['RESTAURANT']
                });

                // Near the user (37.9838, 23.7275)
                await db.createPlace({
                    name: 'Near Restaurant',
                    category: 'RESTAURANT',
                    description: 'Close by',
                    city: 'Athens',
                    rating: 4.0,
                    location: { latitude: 37.9840, longitude: 23.7280 }
                });

                // Far from user
                await db.createPlace({
                    name: 'Far Restaurant',
                    category: 'RESTAURANT',
                    description: 'Far away',
                    city: 'Thessaloniki',
                    rating: 4.8,
                    location: { latitude: 40.6401, longitude: 22.9444 }
                });

                // Act - With location parameters
                const response = await authRequest(token)
                    .get(`/users/${user.userId}/recommendations?latitude=37.9838&longitude=23.7275`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations.length).toBeGreaterThanOrEqual(2);

                const nearIndex = response.body.data.recommendations.findIndex(p => p.name === 'Near Restaurant');
                const farIndex = response.body.data.recommendations.findIndex(p => p.name === 'Far Restaurant');

                expect(nearIndex).toBeGreaterThanOrEqual(0);
                expect(farIndex).toBeGreaterThanOrEqual(0);
                expect(nearIndex).toBeLessThan(farIndex);
                expect(response.body.data.recommendations[nearIndex]).toHaveProperty('distance');
            });

            it('should filter places based on maxDistance', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Cafe Profile',
                    categories: ['RESTAURANT']
                });

                // Nearby place (< 1km)
                await db.createPlace({
                    name: 'Nearby Cafe',
                    category: 'RESTAURANT',
                    description: 'Very close',
                    city: 'Athens',
                    rating: 4.0,
                    location: { latitude: 37.9840, longitude: 23.7280 }
                });

                // Far place (> 100km)
                await db.createPlace({
                    name: 'Far Cafe',
                    category: 'RESTAURANT',
                    description: 'Far away',
                    city: 'Thessaloniki',
                    rating: 4.8,
                    location: { latitude: 40.6401, longitude: 22.9444 }
                });

                // Act - With maxDistance=10 (10km)
                const response = await authRequest(token)
                    .get(`/users/${user.userId}/recommendations?latitude=37.9838&longitude=23.7275&maxDistance=10`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations.length).toBeGreaterThanOrEqual(1);

                const names = response.body.data.recommendations.map(p => p.name);
                expect(names).toContain('Nearby Cafe');

                response.body.data.recommendations.forEach(place => {
                    if (place.distance !== undefined) {
                        expect(place.distance).toBeLessThanOrEqual(10);
                    }
                });
            });

            it('should place locations without coordinates at the end', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Shopping Profile',
                    categories: ['SHOPPING']
                });

                // Place with location
                await db.createPlace({
                    name: 'Mall with Location',
                    category: 'SHOPPING',
                    description: 'Located mall',
                    city: 'Athens',
                    rating: 4.5,
                    location: { latitude: 37.9840, longitude: 23.7280 }
                });

                // Place without location
                await db.createPlace({
                    name: 'Mall without Location',
                    category: 'SHOPPING',
                    description: 'No location data',
                    city: 'Athens',
                    rating: 4.9 // Higher rating but will be second
                });

                // Act
                const response = await authRequest(token)
                    .get(`/users/${user.userId}/recommendations?latitude=37.9838&longitude=23.7275`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations.length).toBeGreaterThanOrEqual(2);

                const withLocationIndex = response.body.data.recommendations.findIndex(p => p.name === 'Mall with Location');
                const withoutLocationIndex = response.body.data.recommendations.findIndex(p => p.name === 'Mall without Location');

                expect(withLocationIndex).toBeGreaterThanOrEqual(0);
                expect(withoutLocationIndex).toBeGreaterThanOrEqual(0);
                expect(withLocationIndex).toBeLessThan(withoutLocationIndex);
                expect(response.body.data.recommendations[withLocationIndex]).toHaveProperty('distance');
                expect(response.body.data.recommendations[withoutLocationIndex]).not.toHaveProperty('distance');
            });
        });

        describe('Edge Cases', () => {
            it('should handle user with preferences but without matching places', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Rare Preferences',
                    categories: ['EXTREME_SPORTS'] // Non-existent category
                });

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/recommendations`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations).toEqual([]);
            });

            it('should handle user that has disliked all matching places', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Museum Profile',
                    categories: ['MUSEUM']
                });

                // Get all MUSEUM places
                const allMuseums = await db.getPlacesByCategories(['MUSEUM']);

                // Dislike ALL museums
                for (const museum of allMuseums) {
                    await db.addDislikedPlace(user.userId, museum.placeId);
                }

                // Act
                const response = await authRequest(token).get(`/users/${user.userId}/recommendations`);

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations).toEqual([]);
            });

            it('should handle invalid location parameters', async () => {
                // Arrange
                const { user, token } = await createAuthenticatedUser();

                await db.addPreferenceProfile({
                    userId: user.userId,
                    name: 'Test Profile',
                    categories: ['MUSEUM']
                });

                await db.createPlace({
                    name: 'Test Museum',
                    category: 'MUSEUM',
                    description: 'Test',
                    city: 'Athens',
                    rating: 4.5
                });

                // Act - With invalid location
                const response = await authRequest(token)
                    .get(`/users/${user.userId}/recommendations?latitude=invalid&longitude=invalid`);

                // Assert - Will ignore the location and return normally
                expect(response.status).toBe(200);
                expect(response.body.data.recommendations.length).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
