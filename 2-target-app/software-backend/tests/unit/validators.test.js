/**
 * @fileoverview Unit Tests for Validators - Core Validation Functions
 * @description This test suite validates the core input validation utility functions
 * used throughout the application. These validators ensure data integrity for
 * emails, passwords, ratings, coordinates, and various ID formats.
 * 
 * @module tests/unit/validators.test
 * @requires ../../utils/validators
 * @requires ../../config/constants
 */

import {
    isValidEmail,
    validatePassword,
    isValidRating,
    isValidCoordinates,
    isValidUserId,
    isValidPlaceId,
    isValidProfileId
} from '../../utils/validators.js';

import { MIN_PASSWORD_LENGTH, MIN_RATING, MAX_RATING } from '../../config/constants.js';

/**
 * Validators - Core Functions Test Suite
 * @description Comprehensive unit tests for validation utility functions.
 */

describe('Validators - Core Functions', () => {

    // Tests for email format validation using regex
    describe('isValidEmail()', () => {

        // Valid email formats should return true
        describe('Happy Path - Valid Emails', () => {
            it('should return true for valid email', () => {
                expect(isValidEmail('test@example.com')).toBe(true);
                expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
                expect(isValidEmail('firstname+lastname@company.org')).toBe(true);
            });
        });

        describe('Unhappy Path - Invalid Emails', () => {
            it('should return false for email without @', () => {
                expect(isValidEmail('invalidemail.com')).toBe(false);
            });
            it('should return false for email without domain', () => {
                expect(isValidEmail('user@')).toBe(false);
            });
            it('should return false for email with spaces', () => {
                expect(isValidEmail('user name@example.com')).toBe(false);
            });
            it('should return false for null/undefined', () => {
                expect(isValidEmail(null)).toBe(false);
                expect(isValidEmail(undefined)).toBe(false);
            });
            it('should return false for non-string values', () => {
                expect(isValidEmail(123)).toBe(false);
                expect(isValidEmail({})).toBe(false);
                expect(isValidEmail([])).toBe(false);
            });
        });

    });

    // Tests for password strength validation
    describe('validatePassword()', () => {

        // Valid passwords meeting minimum length should pass
        describe('Happy Path - Valid Passwords', () => {
            it('should return isValid: true for valid password', () => {
                const result = validatePassword('validPassword123');
                expect(result.isValid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });
            it('should accept password exactly in the minimum length', () => {
                const minPassword = 'a'.repeat(MIN_PASSWORD_LENGTH);
                const result = validatePassword(minPassword);
                expect(result.isValid).toBe(true);
            });
        });

        describe('Unhappy Path - Invalid Passwords', () => {
            it('should return error for short password', () => {
                const result = validatePassword('abc');
                expect(result.isValid).toBe(false);
                expect(result.errors).toContain(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
            });
            it('should return error for null/undefined', () => {
                expect(validatePassword(null).isValid).toBe(false);
                expect(validatePassword(undefined).isValid).toBe(false);
            });
            it('should return error for non-string', () => {
                expect(validatePassword(12345).isValid).toBe(false);
            });
        });

    });

    // Tests for rating value validation (1-5 integer range)
    describe('isValidRating()', () => {

        // Ratings within bounds should be valid
        describe('Happy Path - Valid Ratings', () => {
            it('should return true for rating within limits', () => {
                expect(isValidRating(1)).toBe(true);
                expect(isValidRating(3)).toBe(true);
                expect(isValidRating(5)).toBe(true);
            });
            it('should accept the boundary values', () => {
                expect(isValidRating(MIN_RATING)).toBe(true);
                expect(isValidRating(MAX_RATING)).toBe(true);
            });
        });

        describe('Unhappy Path - Invalid Ratings', () => {
            it('should return false for rating below minimum', () => {
                expect(isValidRating(0)).toBe(false);
                expect(isValidRating(-1)).toBe(false);
            });
            it('should return false for rating above maximum', () => {
                expect(isValidRating(6)).toBe(false);
            });
            it('should return false for decimal ratings', () => {
                expect(isValidRating(3.5)).toBe(false);
            });
            it('should return false for non-number values', () => {
                expect(isValidRating('5')).toBe(false);
                expect(isValidRating(null)).toBe(false);
            });
        });

    });

    // Tests for geographic coordinate validation
    describe('isValidCoordinates()', () => {

        // Lat/lng within bounds should be valid
        describe('Happy Path - Valid Coordinates', () => {
            it('should return true for valid coordinates', () => {
                expect(isValidCoordinates(37.9838, 23.7275)).toBe(true);
                expect(isValidCoordinates(0, 0)).toBe(true);
            });
            it('should accept boundary values', () => {
                expect(isValidCoordinates(90, 180)).toBe(true);
                expect(isValidCoordinates(-90, -180)).toBe(true);
            });
        });

        describe('Unhappy Path - Invalid Coordinates', () => {
            it('should return false for latitude outside limits', () => {
                expect(isValidCoordinates(91, 0)).toBe(false);
                expect(isValidCoordinates(-91, 0)).toBe(false);
            });
            it('should return false for longitude outside limits', () => {
                expect(isValidCoordinates(0, 181)).toBe(false);
            });
            it('should return false for non-number values', () => {
                expect(isValidCoordinates('37.9838', 23.7275)).toBe(false);
                expect(isValidCoordinates(null, null)).toBe(false);
            });
        });

    });

    describe('ID Validators', () => {

        describe('isValidUserId()', () => {
            it('should return true for positive integers', () => {
                expect(isValidUserId(1)).toBe(true);
                expect(isValidUserId('42')).toBe(true);
            });
            it('should return false for zero and negative', () => {
                expect(isValidUserId(0)).toBe(false);
                expect(isValidUserId(-1)).toBe(false);
            });
            it('should accept decimal numbers (parseInt trims)', () => {
                expect(isValidUserId(1.5)).toBe(true);
            });
            it('should return false for null/undefined', () => {
                expect(isValidUserId(null)).toBe(false);
            });
        });

        describe('isValidPlaceId()', () => {
            it('should have the same behavior as isValidUserId', () => {
                expect(isValidPlaceId(1)).toBe(true);
                expect(isValidPlaceId(0)).toBe(false);
            });
        });

        describe('isValidProfileId()', () => {
            it('should have the same behavior as isValidUserId', () => {
                expect(isValidProfileId(1)).toBe(true);
                expect(isValidProfileId(0)).toBe(false);
            });
        });

    });

});
