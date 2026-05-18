/**
 * @fileoverview Geo Utilities Tests
 * @module tests/unit/utils.geoUtils.test
 * @requires ../../utils/geoUtils
 */

import { toRad, calculateDistance } from '../../utils/geoUtils.js';

describe('Geo Utilities', () => {

    describe('toRad', () => {
        it('should convert degrees to radians correctly', () => {
            expect(toRad(0)).toBe(0);
            expect(toRad(180)).toBe(Math.PI);
            expect(toRad(90)).toBe(Math.PI / 2);
        });
    });

    describe('calculateDistance', () => {
        it('should calculate distance between two points', () => {
            // New York (40.7128, -74.0060) to London (51.5074, -0.1278)
            const nyLat = 40.7128;
            const nyLon = -74.0060;
            const londonLat = 51.5074;
            const londonLon = -0.1278;

            // Approximate distance is 5570 km
            const distance = calculateDistance(
                { latitude: nyLat, longitude: nyLon },
                { latitude: londonLat, longitude: londonLon }
            );
            expect(distance).toBeCloseTo(5570.2, 0);
        });

        it('should return 0 for same location', () => {
            expect(calculateDistance(
                { latitude: 10, longitude: 10 },
                { latitude: 10, longitude: 10 }
            )).toBe(0);
        });
    });
});
