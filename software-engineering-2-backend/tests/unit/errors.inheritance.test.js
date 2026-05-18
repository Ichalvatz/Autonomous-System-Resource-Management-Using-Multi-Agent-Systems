/**
 * @fileoverview Unit Tests for Custom Error Classes - Inheritance
 * @description This test suite validates error class inheritance, instanceof checks,
 * and error name property correctness.
 * 
 * @module tests/unit/errors.inheritance.test
 * @requires ../../utils/errors
 */

import {
    APIError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    InternalServerError
} from '../../utils/errors.js';

/**
 * Custom Error Classes - Inheritance Test Suite
 * @description Tests for error inheritance and instanceof checks.
 */
describe('Custom Error Classes - Inheritance', () => {
    describe('Error inheritance and instanceof checks', () => {
        it('should be instance of Error', () => {
            const error = new APIError('Test');

            expect(error instanceof Error).toBe(true);
        });

        it('should be instance of APIError', () => {
            const error = new ValidationError('Test');

            expect(error instanceof APIError).toBe(true);
            expect(error instanceof Error).toBe(true);
        });

        it('should allow error type checking', () => {
            const validationError = new ValidationError('Test');
            const authError = new AuthenticationError('Test');

            expect(validationError instanceof ValidationError).toBe(true);
            expect(validationError instanceof AuthenticationError).toBe(false);
            expect(authError instanceof AuthenticationError).toBe(true);
        });
    });

    describe('Error name property', () => {
        it('should set correct name for each error type', () => {
            expect(new APIError('Test').name).toBe('APIError');
            expect(new ValidationError('Test').name).toBe('ValidationError');
            expect(new AuthenticationError('Test').name).toBe('AuthenticationError');
            expect(new AuthorizationError('Test').name).toBe('AuthorizationError');
            expect(new NotFoundError('Test').name).toBe('NotFoundError');
            expect(new ConflictError('Test').name).toBe('ConflictError');
            expect(new InternalServerError('Test').name).toBe('InternalServerError');
        });
    });
});
