/**
 * @fileoverview Integration Tests for Place Controller - Search
 * @description This test suite validates place search functionality including
 * keyword matching, case sensitivity, and HATEOAS links.
 * 
 * @module tests/integration/place.read.test
 * @requires ../helpers/testUtils
 * @requires ../../config/db
 */

import { api, createTestUser } from '../helpers/testUtils.js';
import db from '../../config/db.js';

/**
 * Place Controller - Search Tests
 * @description Tests for place search functionality.
 */
describe('Place Controller - Search Tests', () => {
    describe('GET /places/search', () => {
        describe('Happy Path - Successful Search', () => {
            it('should return places matching keyword', async () => {
                await db.createPlace({ name: 'Acropolis Museum', category: 'museum', description: 'Ancient Greek', city: 'Athens', country: 'Greece' });
                await db.createPlace({ name: 'National Museum', category: 'museum', description: 'Archaeological', city: 'Athens', country: 'Greece' });
                await db.createPlace({ name: 'Taverna Plaka', category: 'restaurant', description: 'Traditional', city: 'Athens', country: 'Greece' });
                const response = await api.get('/places/search?keywords=museum');
                expect(response.status).toBe(200);
                expect(response.body.data.results.length).toBeGreaterThanOrEqual(2);
            });

            it('should return empty results when no matches', async () => {
                const response = await api.get('/places/search?keywords=nonexistent123');
                expect(response.status).toBe(200);
                expect(response.body.data.results).toEqual([]);
                expect(response.body.data.totalResults).toBe(0);
            });

            it('should support multiple keywords', async () => {
                await db.createPlace({ name: 'Athens Museum', category: 'museum', description: 'Museum', city: 'Athens' });
                await db.createPlace({ name: 'Greek Restaurant', category: 'restaurant', description: 'Traditional', city: 'Athens' });
                const response = await api.get('/places/search?keywords=museum&keywords=restaurant');
                expect(response.status).toBe(200);
                expect(response.body.data.searchTerms).toHaveLength(2);
            });

            it('should return empty results when no keywords given', async () => {
                const response = await api.get('/places/search');
                expect(response.status).toBe(200);
                expect(response.body.data.results).toEqual([]);
            });

            it('should contain reviews and links for each result', async () => {
                const testPlace = await db.createPlace({ name: 'Popular Museum', category: 'museum', description: 'Very popular', city: 'Athens' });
                const user = await createTestUser();
                await db.addReview({ userId: user.userId, placeId: testPlace.placeId, rating: 5, comment: 'Great!' });
                const response = await api.get('/places/search?keywords=museum');
                const result = response.body.data.results.find(p => p.placeId === testPlace.placeId);
                expect(result).toHaveProperty('reviews');
                expect(result).toHaveProperty('links');
            });

            it('should contain HATEOAS links', async () => {
                const response = await api.get('/places/search?keywords=test');
                expect(response.status).toBe(200);
                expect(response.body.data).toHaveProperty('links');
            });
        });

        describe('Edge Cases - Case Sensitivity', () => {
            it('should be case-insensitive', async () => {
                await db.createPlace({ name: 'ACROPOLIS MUSEUM', category: 'museum', description: 'Famous', city: 'Athens' });
                const response = await api.get('/places/search?keywords=acropolis');
                expect(response.status).toBe(200);
                expect(response.body.data.results.length).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
