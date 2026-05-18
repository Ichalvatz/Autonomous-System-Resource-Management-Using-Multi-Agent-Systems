/**
 * @fileoverview Unit Tests for Custom Error Classes - Error Types
 * @description This test suite validates the custom error class hierarchy used
 * throughout the application for standardized error handling. Tests ensure that
 * each error class correctly sets status codes, error types, and additional metadata.
 * 
 * @module tests/unit/errors.classes.test
 * @requires ../../utils/errors
 * 
 * Error classes tested:
 * - APIError: Base error class (500)
 * - ValidationError: Input validation errors (400)
 * - AuthenticationError: Authentication failures (401)
 * - AuthorizationError: Permission denied (403)
 * - NotFoundError: Resource not found (404)
 * - ConflictError: Resource conflicts (409)
 * - InternalServerError: Server errors (500)
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
 * Custom Error Classes - Types Test Suite
 * @description Tests for individual error class behavior and properties.
 */
describe('Custom Error Classes - Types', () => {
    describe('APIError', () => {
        it('should create base error with default status 500', () => {
            const error = new APIError('Test error');

            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(500);
            expect(error.name).toBe('APIError');
        });

        it('should create error with custom status code', () => {
            const error = new APIError('Test error', 418);

            expect(error.statusCode).toBe(418);
        });

        it('should capture stack trace', () => {
            const error = new APIError('Test error');

            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('APIError');
        });
    });

    describe('ValidationError', () => {
        it('should create validation error with field and value', () => {
            const error = new ValidationError('Invalid email', 'email', 'test@');

            expect(error.message).toBe('Invalid email');
            expect(error.statusCode).toBe(400);
            expect(error.error).toBe('VALIDATION_ERROR');
            expect(error.field).toBe('email');
            expect(error.value).toBe('test@');
        });

        it('should create validation error without field', () => {
            const error = new ValidationError('Validation failed');

            expect(error.field).toBeNull();
            expect(error.value).toBeNull();
        });

        it('should handle null value explicitly', () => {
            const error = new ValidationError('Field required', 'name', null);

            expect(error.field).toBe('name');
            expect(error.value).toBeNull();
        });
    });

    describe('AuthenticationError', () => {
        it('should create authentication error with default message', () => {
            const error = new AuthenticationError();

            expect(error.message).toBe('Authentication required');
            expect(error.statusCode).toBe(401);
            expect(error.error).toBe('AUTHENTICATION_ERROR');
        });

        it('should create authentication error with custom message', () => {
            const error = new AuthenticationError('Token expired');

            expect(error.message).toBe('Token expired');
            expect(error.statusCode).toBe(401);
        });
    });

    describe('AuthorizationError', () => {
        it('should create authorization error with default message', () => {
            const error = new AuthorizationError();

            expect(error.message).toBe('Insufficient permissions');
            expect(error.statusCode).toBe(403);
            expect(error.error).toBe('AUTHORIZATION_ERROR');
        });

        it('should create authorization error with custom message', () => {
            const error = new AuthorizationError('Admin access required');

            expect(error.message).toBe('Admin access required');
        });
    });

    describe('NotFoundError', () => {
        it('should create not found error with resource and identifier', () => {
            const error = new NotFoundError('User', 123);

            expect(error.message).toBe('User with ID 123 not found');
            expect(error.statusCode).toBe(404);
            expect(error.error).toBe('NOT_FOUND');
            expect(error.resource).toBe('User');
            expect(error.identifier).toBe(123);
        });

        it('should create not found error without identifier', () => {
            const error = new NotFoundError('Resource');

            expect(error.message).toBe('Resource not found');
            expect(error.identifier).toBeNull();
        });

        it('should handle string identifiers', () => {
            const error = new NotFoundError('Document', 'abc-123');

            expect(error.message).toBe('Document with ID abc-123 not found');
            expect(error.identifier).toBe('abc-123');
        });

        it('should handle null identifier explicitly', () => {
            const error = new NotFoundError('Item', null);

            expect(error.message).toBe('Item not found');
            expect(error.identifier).toBeNull();
        });

        it('should handle undefined identifier', () => {
            const error = new NotFoundError('Item', undefined);

            expect(error.message).toBe('Item not found');
            expect(error.identifier).toBeNull();
        });
    });

    describe('ConflictError', () => {
        it('should create conflict error with field', () => {
            const error = new ConflictError('Email already exists', 'email');

            expect(error.message).toBe('Email already exists');
            expect(error.statusCode).toBe(409);
            expect(error.error).toBe('CONFLICT');
            expect(error.field).toBe('email');
        });

        it('should create conflict error without field', () => {
            const error = new ConflictError('Resource conflict');

            expect(error.field).toBeNull();
        });
    });

    describe('InternalServerError', () => {
        it('should create internal server error with default message', () => {
            const error = new InternalServerError();

            expect(error.message).toBe('An unexpected error occurred');
            expect(error.statusCode).toBe(500);
            expect(error.error).toBe('INTERNAL_SERVER_ERROR');
        });

        it('should create internal server error with custom message', () => {
            const error = new InternalServerError('Database connection failed');

            expect(error.message).toBe('Database connection failed');
        });
    });
});
