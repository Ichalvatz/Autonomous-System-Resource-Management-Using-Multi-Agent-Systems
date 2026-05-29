/**
 * @fileoverview Unit Tests for Helpers - Core Functions
 * @description This test suite validates core helper functions including
 * distance calculation (Haversine), user data sanitization, and pagination parsing.
 * 
 * @module tests/unit/helpers.test
 * @requires ../../utils/helpers
 */

import {
    calculateDistance,
    sanitizeUser,
    sanitizeUsers,
    parsePagination
} from '../../utils/helpers.js';

/**
 * Helpers - Core Functions Test Suite
 * @description Tests for distance, sanitize, and pagination helpers.
 */
describe('Helpers - Core Functions', () => {

    // Tests for Haversine distance calculation between coordinates
    describe('calculateDistance()', () => {

        // Validates accurate distance calculations between known points
        describe('Happy Path - Valid Distance Calculations', () => {

            it('should calculate correctly the distance between two points', () => {
                const distance = calculateDistance(37.9838, 23.7275, 40.6401, 22.9444);
                expect(distance).toBeGreaterThan(290);
                expect(distance).toBeLessThan(310);
            });

            it('should return 0 for the same point', () => {
                const distance = calculateDistance(37.9838, 23.7275, 37.9838, 23.7275);
                expect(distance).toBe(0);
            });

            it('should round to 2 decimal places', () => {
                const distance = calculateDistance(40.7128, -74.0060, 34.0522, -118.2437);
                expect(distance).toBe(Math.round(distance * 100) / 100);
            });

        });

        describe('Edge Cases', () => {

            it('should handle small distances', () => {
                const distance = calculateDistance(37.9838, 23.7275, 37.9839, 23.7276);
                expect(distance).toBeGreaterThan(0);
                expect(distance).toBeLessThan(1);
            });

            it('should handle large distances', () => {
                const distance = calculateDistance(40.7128, -74.0060, -33.8688, 151.2093);
                expect(distance).toBeGreaterThan(15000);
            });

        });

    });

    // Tests for user object sanitization (password removal)
    describe('sanitizeUser()', () => {

        // Verifies password field is removed from user objects
        describe('Happy Path - Remove Password', () => {

            it('should remove the password field from user object', () => {
                const user = {
                    userId: 1,
                    username: 'testuser',
                    email: 'test@example.com',
                    password: 'secretPassword123'
                };

                const sanitized = sanitizeUser(user);

                expect(sanitized).not.toHaveProperty('password');
                expect(sanitized).toHaveProperty('userId', 1);
                expect(sanitized).toHaveProperty('username', 'testuser');
                expect(sanitized).toHaveProperty('email', 'test@example.com');
            });

            it('should handle object with toObject() method (Mongoose)', () => {
                const mockUser = {
                    userId: 2,
                    username: 'mongoose',
                    password: 'hashed',
                    toObject: function () {
                        return {
                            userId: this.userId,
                            username: this.username,
                            password: this.password
                        };
                    }
                };

                const sanitized = sanitizeUser(mockUser);

                expect(sanitized).not.toHaveProperty('password');
                expect(sanitized.userId).toBe(2);
            });

        });

        describe('Edge Cases', () => {

            it('should return null for null input', () => {
                expect(sanitizeUser(null)).toBeNull();
            });

            it('should return null for undefined input', () => {
                expect(sanitizeUser(undefined)).toBeNull();
            });

            it('should handle user without password field', () => {
                const user = { userId: 3, username: 'nopassword' };
                const sanitized = sanitizeUser(user);

                expect(sanitized).toHaveProperty('userId', 3);
                expect(sanitized).toHaveProperty('username', 'nopassword');
            });

        });

    });

    // Tests for batch user sanitization
    describe('sanitizeUsers()', () => {
        // Should remove password from all users in array
        it('should sanitize array of users', () => {
            const users = [
                { userId: 1, username: 'user1', password: 'pass1' },
                { userId: 2, username: 'user2', password: 'pass2' }
            ];

            const sanitized = sanitizeUsers(users);

            expect(sanitized).toHaveLength(2);
            expect(sanitized[0]).not.toHaveProperty('password');
            expect(sanitized[1]).not.toHaveProperty('password');
        });

        it('should return empty array for non-array input', () => {
            expect(sanitizeUsers(null)).toEqual([]);
            expect(sanitizeUsers('not an array')).toEqual([]);
        });

    });

    // Tests for pagination query parameter parsing
    describe('parsePagination()', () => {
        // Validates page and pageSize extraction from query
        it('should parse pagination parameters', () => {
            const result = parsePagination({ page: '2', pageSize: '10' });
            expect(result).toEqual({ page: 2, pageSize: 10, skip: 10 });
        });

        it('should use default values', () => {
            const result = parsePagination({});
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
            expect(result.skip).toBe(0);
        });

        it('should enforce minimum values', () => {
            const result = parsePagination({ page: '0', pageSize: '0' });
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(20);
        });

        it('should enforce maximum page size', () => {
            const result = parsePagination({ pageSize: '200' }, 1, 20, 100);
            expect(result.pageSize).toBe(100);
        });

    });

});
