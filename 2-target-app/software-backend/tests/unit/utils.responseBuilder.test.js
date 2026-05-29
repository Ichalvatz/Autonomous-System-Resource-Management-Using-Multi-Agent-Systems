/**
 * @fileoverview Response Builder Utility Tests
 * Comprehensive test suite for validating standardized API response formatting
 * Tests both success and error response builders with various status codes
 * @module tests/unit/utils.responseBuilder.test
 * @requires ../../utils/responseBuilder
 */

import R from '../../utils/responseBuilder.js';
import { jest } from '@jest/globals';

describe('Response Builder', () => {
    let res;

    /**
     * Setup mock response object before each test
     * Provides chainable mock methods for status, json, and send
     */
    beforeEach(() => {
        res = {
            // Mock status setter that returns itself for chaining
            status: jest.fn().mockReturnThis(),
            // Mock JSON response method
            json: jest.fn().mockReturnThis(),
            // Mock send method for empty responses
            send: jest.fn().mockReturnThis()
        };
    });

    /**
     * Test suite for successful response formatting
     * Validates default and custom status codes with data payloads
     */
    describe('success', () => {
        /**
         * Verify success response with default 200 OK status
         * Tests standard success response structure
         */
        it('should send success response with default status 200', () => {
            // Prepare test data and message
            const data = { id: 1 };
            const message = 'Success';
            
            // Execute the success response builder
            R.success(res, data, message);

            // Verify correct status code is set
            expect(res.status).toHaveBeenCalledWith(200);
            // Verify response body structure matches API contract
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data,
                message,
                error: null
            });
        });

        /**
         * Verify success response with custom status code
         * Tests flexibility of status code parameter
         */
        it('should send success response with custom status', () => {
            // Execute with 201 Created status
            R.success(res, null, 'Created', 201);
            
            // Verify custom status is applied
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });

    /**
     * Test suite for error response formatting
     * Validates error responses with and without additional details
     */
    describe('error', () => {
        /**
         * Test error response with full details object
         * Verifies comprehensive error information is included
         */
        it('should send error response with details', () => {
            // Define all error properties
            const code = 'ERROR_CODE';
            const message = 'Error message';
            const status = 400;
            const details = { field: 'test' };

            // Execute the error response builder
            R.error(res, { code, message, status, details });

            // Verify correct error status code
            expect(res.status).toHaveBeenCalledWith(status);
            // Verify error response structure includes all fields
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                data: null,
                error: code,
                message,
                details
            });
        });

        /**
         * Test error response without optional details
         * Ensures details field is omitted when not provided
         */
        it('should send error response without details', () => {
            // Execute with only required error fields
            R.error(res, { code: 'ERROR', message: 'Message', status: 500 });
            
            // Verify response excludes details field
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                data: null,
                error: 'ERROR',
                message: 'Message'
            });
        });
    });

    /**
     * Test suite for HTTP status convenience methods
     * Validates shorthand methods for common HTTP responses
     */
    describe('convenience methods', () => {
        /**
         * Test 404 Not Found convenience method
         */
        it('notFound should send 404', () => {
            R.notFound(res, 'NOT_FOUND', 'Not found');
            expect(res.status).toHaveBeenCalledWith(404);
        });

        /**
         * Test 400 Bad Request convenience method
         */
        it('badRequest should send 400', () => {
            R.badRequest(res, 'BAD_REQUEST', 'Bad request');
            expect(res.status).toHaveBeenCalledWith(400);
        });

        /**
         * Test 409 Conflict convenience method
         */
        it('conflict should send 409', () => {
            R.conflict(res, 'CONFLICT', 'Conflict');
            expect(res.status).toHaveBeenCalledWith(409);
        });

        /**
         * Test 403 Forbidden convenience method
         */
        it('forbidden should send 403', () => {
            R.forbidden(res, 'FORBIDDEN', 'Forbidden');
            expect(res.status).toHaveBeenCalledWith(403);
        });

        /**
         * Test 401 Unauthorized convenience method
         */
        it('unauthorized should send 401', () => {
            R.unauthorized(res, 'UNAUTHORIZED', 'Unauthorized');
            expect(res.status).toHaveBeenCalledWith(401);
        });

        /**
         * Test 204 No Content convenience method
         * Verifies empty response with appropriate status
         */
        it('noContent should send 204', () => {
            R.noContent(res);
            // Verify status and that send (not json) is called
            expect(res.status).toHaveBeenCalledWith(204);
            expect(res.send).toHaveBeenCalled();
        });
    });
});
