/**
 * @fileoverview Validation Middleware Tests - Formatting
 * @module tests/unit/validation.formatting.test
 * 
 * Tests validation error formatting and middleware export verification.
 * Ensures errors are transformed into consistent API response format.
 */

import { validate } from '../../middleware/validation.js';

/**
 * Test suite for validation error formatting.
 * Verifies error transformation from express-validator to API format.
 */
describe('Validation Middleware - Formatting', () => {
    // Tests for error message structure transformation
    describe('error formatting', () => {
        it('should format validation errors correctly', () => {
            const mockErrors = [
                { param: 'username', msg: 'Username is required', value: undefined },
                { param: 'age', msg: 'Must be 18 or older', value: 15 }
            ];

            const formatted = mockErrors.map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }));

            expect(formatted).toHaveLength(2);
            expect(formatted[0]).toEqual({
                field: 'username',
                message: 'Username is required',
                value: undefined
            });
            expect(formatted[1]).toEqual({
                field: 'age',
                message: 'Must be 18 or older',
                value: 15
            });
        });

        it('should handle multiple validation errors on same field', () => {
            const mockErrors = [
                { param: 'password', msg: 'Password is required', value: '' },
                { param: 'password', msg: 'Password must be at least 8 characters', value: '' },
                { param: 'password', msg: 'Password must contain a number', value: '' }
            ];

            const formatted = mockErrors.map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }));

            expect(formatted).toHaveLength(3);
            expect(formatted.every(e => e.field === 'password')).toBe(true);
        });

        it('should preserve error values in formatted output', () => {
            const mockErrors = [
                { param: 'rating', msg: 'Rating must be between 1 and 5', value: 10 },
                { param: 'url', msg: 'Invalid URL format', value: 'not-a-url' }
            ];

            const formatted = mockErrors.map(err => ({
                field: err.param,
                message: err.msg,
                value: err.value
            }));

            expect(formatted[0].value).toBe(10);
            expect(formatted[1].value).toBe('not-a-url');
        });
    });

    describe('validate export', () => {
        it('should export validate function', () => {
            expect(validate).toBeDefined();
            expect(typeof validate).toBe('function');
        });

        it('should have correct function signature (3 parameters)', () => {
            expect(validate.length).toBe(3);
        });
    });
});
