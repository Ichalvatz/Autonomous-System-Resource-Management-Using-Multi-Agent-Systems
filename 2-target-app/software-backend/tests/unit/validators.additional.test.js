/**
 * @fileoverview Validators Tests - Additional Validators
 * @module tests/unit/validators.additional.test
 * 
 * Tests additional input validation functions: string sanitization,
 * required field checking, and format validators for phone, URL, and date.
 */

import {
    sanitizeString,
    validateRequiredFields,
    isValidStringArray,
    isValidPhone,
    isValidUrl,
    isValidDate
} from '../../utils/validators.js';

/**
 * Test suite for additional validation utility functions.
 * Validates sanitization, field requirements, and format validations.
 */
describe('Additional Validators - Unit Tests', () => {

    // Tests string trimming and length limiting behavior
    describe('sanitizeString()', () => {

        it('should trim and limit string length', () => {
            const result = sanitizeString('  hello  ', 10);
            expect(result).toBe('hello');
        });

        it('should truncate to maxLength', () => {
            const longString = 'a'.repeat(100);
            const result = sanitizeString(longString, 50);
            expect(result.length).toBe(50);
        });

        it('should return empty string for non-string', () => {
            expect(sanitizeString(null)).toBe('');
            expect(sanitizeString(123)).toBe('');
        });

    });

    describe('validateRequiredFields()', () => {

        it('should validate required fields exist', () => {
            const obj = { name: 'Test', email: 'test@test.com' };
            const result = validateRequiredFields(obj, ['name', 'email']);
            expect(result.isValid).toBe(true);
            expect(result.missing).toEqual([]);
        });

        it('should identify missing fields', () => {
            const obj = { name: 'Test' };
            const result = validateRequiredFields(obj, ['name', 'email', 'phone']);
            expect(result.isValid).toBe(false);
            expect(result.missing).toEqual(['email', 'phone']);
        });

        it('should treat empty string as missing', () => {
            const obj = { name: '', email: null };
            const result = validateRequiredFields(obj, ['name', 'email']);
            expect(result.isValid).toBe(false);
            expect(result.missing).toEqual(['name', 'email']);
        });

    });

    describe('isValidStringArray()', () => {

        it('should return true for valid string array', () => {
            expect(isValidStringArray(['a', 'b', 'c'])).toBe(true);
            expect(isValidStringArray([])).toBe(true);
        });

        it('should return false for mixed array', () => {
            expect(isValidStringArray(['a', 1, 'c'])).toBe(false);
        });

        it('should return false for non-array', () => {
            expect(isValidStringArray('not an array')).toBe(false);
            expect(isValidStringArray(null)).toBe(false);
        });

    });

    describe('isValidPhone()', () => {

        it('should return true for valid phone numbers', () => {
            expect(isValidPhone('1234567890')).toBe(true);
            expect(isValidPhone('+1 (234) 567-8900')).toBe(true);
            expect(isValidPhone('+30 210 1234567')).toBe(true);
        });

        it('should return false for short numbers', () => {
            expect(isValidPhone('123')).toBe(false);
        });

        it('should return false for invalid characters', () => {
            expect(isValidPhone('123abc7890')).toBe(false);
        });

        it('should return false for non-string', () => {
            expect(isValidPhone(null)).toBe(false);
            expect(isValidPhone(1234567890)).toBe(false);
        });

    });

    describe('isValidUrl()', () => {

        it('should return true for valid URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('http://test.org/path')).toBe(true);
            expect(isValidUrl('https://sub.domain.com:8080/path?query=1')).toBe(true);
        });

        it('should return false for invalid URLs', () => {
            expect(isValidUrl('not a url')).toBe(false);
            expect(isValidUrl('ftp://file.com')).toBe(true);
            expect(isValidUrl('invalid')).toBe(false);
        });

        it('should return false for non-string', () => {
            expect(isValidUrl(null)).toBe(false);
            expect(isValidUrl(123)).toBe(false);
        });

    });

    describe('isValidDate()', () => {

        it('should return true for valid ISO date strings', () => {
            expect(isValidDate('2024-01-01')).toBe(true);
            expect(isValidDate('2024-01-01T10:30:00Z')).toBe(true);
        });

        it('should return false for invalid dates', () => {
            expect(isValidDate('not a date')).toBe(false);
            expect(isValidDate('2024-13-01')).toBe(false);
        });

        it('should return false for non-string', () => {
            expect(isValidDate(null)).toBe(false);
            expect(isValidDate(123)).toBe(false);
        });

    });

});
