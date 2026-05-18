/**
 * @fileoverview Unit Tests for Helper Utility Functions
 * @description This test suite validates the utility helper functions used throughout
 * the application for common operations like string manipulation, object handling,
 * date formatting, and type checking. These utilities are foundational to many
 * other modules and require thorough testing.
 * 
 * @module tests/unit/helpers.utility.test
 * @requires ../../utils/helpers
 * 
 * Functions tested:
 * - slugify: URL-friendly string conversion
 * - sleep: Promise-based delay
 * - randomInt: Random integer generation
 * - isEmptyObject: Empty object detection
 * - deepClone: Deep object cloning
 * - formatDate: Date to ISO string formatting
 * - pick: Object property selection
 * - omit: Object property exclusion
 * - capitalize: String capitalization
 * - isNumeric: Numeric value detection
 * - truncate: String truncation with suffix
 */

import {
    slugify,
    sleep,
    randomInt,
    isEmptyObject,
    deepClone,
    formatDate,
    pick,
    omit,
    capitalize,
    isNumeric,
    truncate
} from '../../utils/helpers.js';

/**
 * Helpers - Utility Functions Test Suite
 * 
 * @description Comprehensive unit tests for utility helper functions.
 * Each function is tested for happy path scenarios, edge cases, and
 * error handling to ensure robust behavior across all use cases.
 */
describe('Helpers - Utility Functions', () => {

    /**
     * slugify() Function Tests
     * 
     * @description Tests for the URL slug generation utility.
     * Slugify converts human-readable text into URL-friendly strings
     * by lowercasing, replacing spaces with hyphens, and removing special characters.
     */
    describe('slugify()', () => {

        /**
         * Happy Path Tests - Successful Slug Generation
         * 
         * @description Tests standard slug generation scenarios where
         * valid input strings are converted to URL-friendly slugs.
         */
        describe('Happy Path - Generate URL-friendly slug', () => {

            /**
             * @test Verifies basic text to slug conversion
             * @expected Spaces become hyphens, text is lowercased
             */
            it('should convert text to slug', () => {
                // Standard multi-word text conversion
                expect(slugify('Test Place Name')).toBe('test-place-name');
                expect(slugify('Hello World')).toBe('hello-world');
            });

            /**
             * @test Verifies removal of special characters
             * @expected Non-alphanumeric characters are stripped
             */
            it('should remove special characters', () => {
                // Special characters should be removed, not replaced
                expect(slugify('Test @#$ Place')).toBe('test-place');
            });

            /**
             * @test Verifies handling of multiple consecutive spaces
             * @expected Multiple spaces collapse to single hyphen
             */
            it('should handle multiple spaces', () => {
                // Consecutive spaces should become a single hyphen
                expect(slugify('Test   Multiple   Spaces')).toBe('test-multiple-spaces');
            });

        });

        /**
         * Edge Case Tests - Boundary Conditions
         * 
         * @description Tests edge cases including null values, wrong types,
         * and strings with leading/trailing whitespace.
         */
        describe('Edge Cases', () => {

            /**
             * @test Verifies graceful handling of null/undefined input
             * @expected Returns empty string for null or undefined
             */
            it('should return empty string for null/undefined', () => {
                // Null safety - return empty string instead of throwing
                expect(slugify(null)).toBe('');
                expect(slugify(undefined)).toBe('');
            });

            /**
             * @test Verifies type checking for non-string inputs
             * @expected Returns empty string for numbers or objects
             */
            it('should return empty string for non-string', () => {
                // Type safety - only strings should be slugified
                expect(slugify(123)).toBe('');
                expect(slugify({})).toBe('');
            });

            /**
             * @test Verifies trimming of leading/trailing whitespace and hyphens
             * @expected Clean slug without leading/trailing hyphens
             */
            it('should trim leading/trailing spaces and dashes', () => {
                // Clean up edges for proper URL formatting
                expect(slugify('  test  ')).toBe('test');
                expect(slugify('--test--')).toBe('test');
            });

        });

    });

    /**
     * sleep() Function Tests
     * 
     * @description Tests for the promise-based delay utility.
     * Sleep is useful for rate limiting, animations, and testing async flows.
     */
    describe('sleep()', () => {

        /**
         * @test Verifies that sleep delays execution for specified duration
         * @expected Elapsed time is approximately equal to sleep duration
         */
        it('should delay for specified milliseconds', async () => {
            // Record start time before sleeping
            const start = Date.now();

            // Sleep for 50 milliseconds
            await sleep(50);

            // Calculate elapsed time (allow 5ms tolerance for timing variance)
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(45);
        });

    });

    /**
     * randomInt() Function Tests
     * 
     * @description Tests for random integer generation within a range.
     * Used for generating test data, IDs, and randomized behaviors.
     */
    describe('randomInt()', () => {

        /**
         * @test Verifies random integer is within specified bounds
         * @expected Result is an integer between min and max (inclusive)
         */
        it('should generate random integer in range', () => {
            // Generate random integer between 1 and 10
            const result = randomInt(1, 10);

            // Verify result is within bounds
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(10);

            // Verify result is an integer (not a float)
            expect(Number.isInteger(result)).toBe(true);
        });

        /**
         * @test Verifies behavior when min equals max
         * @expected Returns the only possible value
         */
        it('should handle min === max', () => {
            // When range is a single value, that value should be returned
            const result = randomInt(5, 5);
            expect(result).toBe(5);
        });

    });

    /**
     * isEmptyObject() Function Tests
     * 
     * @description Tests for empty object detection utility.
     * Used to check if objects have any enumerable properties.
     */
    describe('isEmptyObject()', () => {

        /**
         * @test Verifies detection of empty objects
         * @expected Returns true for objects with no properties
         */
        it('should return true for empty object', () => {
            // Empty object literal should be detected
            expect(isEmptyObject({})).toBe(true);
        });

        /**
         * @test Verifies detection of non-empty objects
         * @expected Returns false for objects with properties
         */
        it('should return false for non-empty object', () => {
            // Object with any property is not empty
            expect(isEmptyObject({ a: 1 })).toBe(false);
        });

        /**
         * @test Verifies handling of non-object values
         * @expected Returns appropriate values for null, undefined, and arrays
         */
        it('should return false for null/undefined/array', () => {
            // Null and undefined are passed through
            expect(isEmptyObject(null)).toBe(null);
            expect(isEmptyObject(undefined)).toBe(undefined);

            // Arrays are not considered empty objects
            expect(isEmptyObject([])).toBe(false);
        });

    });

    /**
     * deepClone() Function Tests
     * 
     * @description Tests for deep object cloning utility.
     * Creates a completely independent copy of nested objects.
     */
    describe('deepClone()', () => {

        /**
         * @test Verifies deep cloning creates independent copy
         * @expected Cloned object is equal but not the same reference
         */
        it('should clone object deeply', () => {
            // Create object with nested structure
            const obj = { a: 1, b: { c: 2 } };
            const cloned = deepClone(obj);

            // Values should be equal
            expect(cloned).toEqual(obj);

            // References should be different (independent copies)
            expect(cloned).not.toBe(obj);
            expect(cloned.b).not.toBe(obj.b);
        });

        /**
         * @test Verifies null handling in deep clone
         * @expected Returns null for null input
         */
        it('should handle null', () => {
            // Null should pass through unchanged
            expect(deepClone(null)).toBe(null);
        });

        /**
         * @test Verifies primitive value handling
         * @expected Primitives are returned as-is
         */
        it('should handle primitives', () => {
            // Primitive values don't need cloning
            expect(deepClone(42)).toBe(42);
            expect(deepClone('test')).toBe('test');
        });

    });

    /**
     * formatDate() Function Tests
     * 
     * @description Tests for date formatting utility.
     * Converts Date objects or date strings to ISO 8601 format.
     */
    describe('formatDate()', () => {

        /**
         * @test Verifies Date object formatting to ISO string
         * @expected Returns properly formatted ISO 8601 string
         */
        it('should format Date object to ISO string', () => {
            // Create date at specific UTC time
            const date = new Date('2024-01-01T00:00:00Z');
            const result = formatDate(date);

            // Should produce ISO 8601 format
            expect(result).toBe('2024-01-01T00:00:00.000Z');
        });

        /**
         * @test Verifies date string parsing and formatting
         * @expected String dates are parsed and reformatted
         */
        it('should format date string to ISO string', () => {
            // Date string should be parsed and converted
            const result = formatDate('2024-01-01');
            expect(result).toContain('2024-01-01');
        });

        /**
         * @test Verifies null/undefined handling
         * @expected Returns null for null or undefined input
         */
        it('should return null for null/undefined', () => {
            // Null safety - don't throw on invalid input
            expect(formatDate(null)).toBe(null);
            expect(formatDate(undefined)).toBe(null);
        });

    });

    /**
     * pick() Function Tests
     * 
     * @description Tests for object property selection utility.
     * Creates a new object with only the specified properties.
     */
    describe('pick()', () => {

        /**
         * @test Verifies selection of specified properties
         * @expected Returns new object with only requested fields
         */
        it('should pick specified fields from object', () => {
            // Source object with multiple properties
            const obj = { a: 1, b: 2, c: 3 };

            // Pick only 'a' and 'c'
            const result = pick(obj, ['a', 'c']);

            // Result should only contain picked properties
            expect(result).toEqual({ a: 1, c: 3 });
        });

        /**
         * @test Verifies handling of non-existent property names
         * @expected Missing properties are silently ignored
         */
        it('should ignore non-existent fields', () => {
            // Requesting non-existent property should not throw
            const obj = { a: 1 };
            const result = pick(obj, ['a', 'b']);

            // Only existing property is included
            expect(result).toEqual({ a: 1 });
        });

    });

    /**
     * omit() Function Tests
     * 
     * @description Tests for object property exclusion utility.
     * Creates a new object without the specified properties.
     */
    describe('omit()', () => {

        /**
         * @test Verifies exclusion of specified properties
         * @expected Returns new object without omitted fields
         */
        it('should omit specified fields from object', () => {
            // Source object with multiple properties
            const obj = { a: 1, b: 2, c: 3 };

            // Omit property 'b'
            const result = omit(obj, ['b']);

            // Result should not contain omitted property
            expect(result).toEqual({ a: 1, c: 3 });
        });

        /**
         * @test Verifies handling of non-existent property names
         * @expected Missing properties are silently ignored
         */
        it('should ignore non-existent fields', () => {
            // Omitting non-existent property should not throw
            const obj = { a: 1, b: 2 };
            const result = omit(obj, ['c']);

            // Object unchanged when omitting non-existent property
            expect(result).toEqual({ a: 1, b: 2 });
        });

    });

    /**
     * capitalize() Function Tests
     * 
     * @description Tests for string capitalization utility.
     * Converts first character to uppercase and rest to lowercase.
     */
    describe('capitalize()', () => {

        /**
         * @test Verifies first letter capitalization
         * @expected First letter uppercase, rest lowercase
         */
        it('should capitalize first letter', () => {
            // Lowercase input should get first letter capitalized
            expect(capitalize('hello')).toBe('Hello');

            // All uppercase input should become title case
            expect(capitalize('WORLD')).toBe('World');
        });

        /**
         * @test Verifies handling of non-string values
         * @expected Returns empty string for invalid input
         */
        it('should return empty string for non-string', () => {
            // Type safety - return empty string for non-strings
            expect(capitalize(null)).toBe('');
            expect(capitalize(123)).toBe('');
        });

    });

    /**
     * isNumeric() Function Tests
     * 
     * @description Tests for numeric value detection utility.
     * Checks if a value can be interpreted as a finite number.
     */
    describe('isNumeric()', () => {

        /**
         * @test Verifies detection of numeric values
         * @expected Returns true for numbers and numeric strings
         */
        it('should return true for numeric values', () => {
            // Integer numbers
            expect(isNumeric(42)).toBe(true);

            // Numeric strings
            expect(isNumeric('42')).toBe(true);

            // Floating point numbers
            expect(isNumeric(3.14)).toBe(true);
        });

        /**
         * @test Verifies rejection of non-numeric values
         * @expected Returns false for non-numeric inputs
         */
        it('should return false for non-numeric values', () => {
            // Non-numeric string
            expect(isNumeric('abc')).toBe(false);

            // Special numeric values that aren't useful numbers
            expect(isNumeric(NaN)).toBe(false);
            expect(isNumeric(Infinity)).toBe(false);
        });

    });

    /**
     * truncate() Function Tests
     * 
     * @description Tests for string truncation utility.
     * Shortens strings to specified length with optional suffix.
     */
    describe('truncate()', () => {

        /**
         * @test Verifies string truncation with default suffix
         * @expected String truncated with '...' appended
         */
        it('should truncate string to specified length', () => {
            // Truncate to 8 characters including suffix
            const result = truncate('Hello World', 8);
            expect(result).toBe('Hello...');
        });

        /**
         * @test Verifies that short strings are not modified
         * @expected String shorter than max length returns unchanged
         */
        it('should not truncate if string is shorter', () => {
            // String already shorter than max length
            const result = truncate('Hi', 10);
            expect(result).toBe('Hi');
        });

        /**
         * @test Verifies custom suffix support
         * @expected Custom suffix replaces default '...'
         */
        it('should use custom suffix', () => {
            // Use custom suffix instead of default
            const result = truncate('Hello World', 8, '---');
            expect(result).toBe('Hello---');
        });

        /**
         * @test Verifies null/undefined handling
         * @expected Returns empty string for invalid input
         */
        it('should return empty string for null/undefined', () => {
            // Null safety - return empty string
            expect(truncate(null, 10)).toBe('');
            expect(truncate(undefined, 10)).toBe('');
        });

    });

});
