/**
 * @fileoverview Response Utilities Tests - Error Responses
 * @module tests/unit/responses.error.test
 * 
 * Tests standardized error response functions for HTTP responses.
 * Verifies correct status codes, error types, and message formatting.
 */

import {
    sendError,
    sendValidationError,
    sendAuthError,
    sendForbiddenError,
    sendNotFoundError,
    sendConflictError
} from '../../utils/responses.js';
import { createMockRes } from '../helpers/mockUtils.js';


/**
 * Test suite for error response utility functions.
 * Tests sendError, sendValidationError, sendAuthError, sendForbiddenError,
 * sendNotFoundError, and sendConflictError functions.
 */
describe('Response Utilities - Error Responses', () => {

    // Tests for the generic sendError function with status codes and details
    describe('sendError()', () => {

        // Validates correct error response structure and status codes
        describe('Happy Path - Error Responses', () => {

            it('should return error with status code', () => {
                const res = createMockRes();

                sendError(res, { error: 'TEST_ERROR', message: 'Something went wrong', statusCode: 400 });

                expect(res.statusCode).toBe(400);
                expect(res.jsonData.success).toBe(false);
                expect(res.jsonData.error).toBe('TEST_ERROR');
                expect(res.jsonData.message).toBe('Something went wrong');
            });

            it('should use 500 as default status', () => {
                const res = createMockRes();

                sendError(res, { error: 'ERROR', message: 'Error message' });

                expect(res.statusCode).toBe(500);
            });

            it('should include details when provided', () => {
                const res = createMockRes();
                const details = { field: 'email', value: 'invalid' };

                sendError(res, { error: 'VALIDATION', message: 'Invalid email', statusCode: 400, details });

                expect(res.jsonData.details).toEqual(details);
            });

            it('should NOT include details when null', () => {
                const res = createMockRes();

                sendError(res, { error: 'ERROR', message: 'Message', statusCode: 400 });

                expect(res.jsonData.details).toBeUndefined();
            });

        });

    });

    describe('sendValidationError()', () => {

        it('should return 400 with VALIDATION_ERROR', () => {
            const res = createMockRes();

            sendValidationError(res, 'Validation failed');

            expect(res.statusCode).toBe(400);
            expect(res.jsonData.error).toBe('VALIDATION_ERROR');
            expect(res.jsonData.message).toBe('Validation failed');
        });

        it('should include validation details', () => {
            const res = createMockRes();
            const details = { errors: [{ field: 'email', message: 'Invalid' }] };

            sendValidationError(res, 'Validation failed', details);

            expect(res.jsonData.details).toEqual(details);
        });

    });

    describe('sendAuthError()', () => {

        it('should return 401 with AUTHENTICATION_ERROR', () => {
            const res = createMockRes();

            sendAuthError(res);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('AUTHENTICATION_ERROR');
            expect(res.jsonData.message).toBe('Authentication required');
        });

        it('should accept custom message', () => {
            const res = createMockRes();

            sendAuthError(res, 'Invalid credentials');

            expect(res.jsonData.message).toBe('Invalid credentials');
        });

    });

    describe('sendForbiddenError()', () => {

        it('should return 403 with AUTHORIZATION_ERROR', () => {
            const res = createMockRes();

            sendForbiddenError(res);

            expect(res.statusCode).toBe(403);
            expect(res.jsonData.error).toBe('AUTHORIZATION_ERROR');
            expect(res.jsonData.message).toBe('Access denied');
        });

        it('should accept custom message', () => {
            const res = createMockRes();

            sendForbiddenError(res, 'Admin access required');

            expect(res.jsonData.message).toBe('Admin access required');
        });

    });

    describe('sendNotFoundError()', () => {

        it('should return 404 with NOT_FOUND', () => {
            const res = createMockRes();

            sendNotFoundError(res, 'User');

            expect(res.statusCode).toBe(404);
            expect(res.jsonData.error).toBe('NOT_FOUND');
            expect(res.jsonData.message).toBe('User not found');
        });

        it('should include identifier in message', () => {
            const res = createMockRes();

            sendNotFoundError(res, 'User', 123);

            expect(res.jsonData.message).toBe('User with ID 123 not found');
        });

        it('should handle null identifier', () => {
            const res = createMockRes();

            sendNotFoundError(res, 'Resource', null);

            expect(res.jsonData.message).toBe('Resource not found');
        });

    });

    describe('sendConflictError()', () => {

        it('should return 409 with CONFLICT', () => {
            const res = createMockRes();

            sendConflictError(res, 'Email already exists');

            expect(res.statusCode).toBe(409);
            expect(res.jsonData.error).toBe('CONFLICT');
            expect(res.jsonData.message).toBe('Email already exists');
        });

        it('should include conflict details', () => {
            const res = createMockRes();
            const details = { field: 'email', value: 'test@example.com' };

            sendConflictError(res, 'Duplicate email', details);

            expect(res.jsonData.details).toEqual(details);
        });

    });

});
