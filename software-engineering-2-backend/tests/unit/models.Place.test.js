/**
 * @fileoverview Place Model Unit Tests
 * Tests static and instance methods for function coverage
 */

import Place from '../../models/Place.js';
import {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
} from '../helpers/mongoDbSetup.js';

describe('Place Model', () => {
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
        // Create test places with varied categories and locations
        beforeEach(async () => {
            await Place.create({
                placeId: 1, name: 'Coffee Shop', category: 'Food',
                city: 'Athens', address: '123 Main St', country: 'Greece',
                location: { latitude: 37.9838, longitude: 23.7275 }
            });
            await Place.create({
                placeId: 2, name: 'Museum', category: 'Culture',
                city: 'Athens', location: { latitude: 37.9890, longitude: 23.7330 }
            });
            await Place.create({
                placeId: 3, name: 'Beach Bar', category: 'Food',
                city: 'Thessaloniki', location: { latitude: 40.6401, longitude: 22.9444 }
            });
        });

        test('findByCategory returns places matching category', async () => {
            const results = await Place.findByCategory('Food');
            expect(results).toHaveLength(2);
            results.forEach(p => expect(p.category).toBe('Food'));
        });

        test('findByCategory returns empty for unknown category', async () => {
            const results = await Place.findByCategory('Unknown');
            expect(results).toHaveLength(0);
        });

        test('findByCity returns places in specified city', async () => {
            const results = await Place.findByCity('Athens');
            expect(results).toHaveLength(2);
            results.forEach(p => expect(p.city).toBe('Athens'));
        });

        test('findByCity returns empty for unknown city', async () => {
            const results = await Place.findByCity('Unknown');
            expect(results).toHaveLength(0);
        });

        test('findNearLocation returns places within distance', async () => {
            const results = await Place.findNearLocation(37.985, 23.730, 5);
            expect(results.length).toBeGreaterThanOrEqual(1);
        });

        test('findNearLocation excludes distant places', async () => {
            const results = await Place.findNearLocation(37.985, 23.730, 0.1);
            expect(results.length).toBeLessThan(3);
        });
    });

    describe('Instance Methods', () => {
        test('hasValidLocation returns true for place with coordinates', async () => {
            const place = await Place.create({
                placeId: 10, name: 'Test Place', category: 'Test',
                location: { latitude: 37.9838, longitude: 23.7275 }
            });
            expect(place.hasValidLocation()).toBe(true);
        });

        test('hasValidLocation returns false for place without location', async () => {
            const place = await Place.create({
                placeId: 11, name: 'No Location', category: 'Test'
            });
            expect(place.hasValidLocation()).toBe(false);
        });

        test('hasValidLocation returns false for partial coordinates', async () => {
            const place = await Place.create({
                placeId: 12, name: 'Partial', category: 'Test',
                location: { latitude: 37.9838 }
            });
            expect(place.hasValidLocation()).toBe(false);
        });

        // Test full address concatenation with all fields
        test('getFullAddress joins address parts', async () => {
            const place = await Place.create({
                placeId: 20, name: 'Full Address', category: 'Test',
                address: '123 Main St', city: 'Athens', country: 'Greece'
            });
            expect(place.getFullAddress()).toBe('123 Main St, Athens, Greece');
        });

        // Test address concatenation with missing fields
        test('getFullAddress handles missing parts', async () => {
            const place = await Place.create({
                placeId: 21, name: 'Partial Address', category: 'Test',
                city: 'Athens'
            });
            expect(place.getFullAddress()).toBe('Athens');
        });

        // Test empty address when no fields are set
        test('getFullAddress returns empty string when no address fields', async () => {
            const place = await Place.create({
                placeId: 22, name: 'No Address', category: 'Test'
            });
            expect(place.getFullAddress()).toBe('');
        });
    });
});
