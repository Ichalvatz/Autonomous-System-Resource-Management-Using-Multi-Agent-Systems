/**
 * @fileoverview Error Handler Middleware - API Error Tests
 * @description This test suite validates error handling for APIError, NotFoundError,
 * and custom errors with field and resource details.
 * 
 * @module tests/unit/middleware.errorHandler.test
 * @requires ../../middleware/errorHandler
 * @requires ../../utils/errors
 */

import errorHandler from '../../middleware/errorHandler.js';
import { APIError, NotFoundError } from '../../utils/errors.js';

/** Helper: Create mock request object */
const createMockReq = () => ({ method: 'GET', path: '/test', body: {}, params: {}, query: {} });

/** Helper: Create mock response object */
const createMockRes = () => {
    const res = { statusCode: 200, jsonData: null };
    res.status = function (code) { this.statusCode = code; return this; };
    res.json = function (data) { this.jsonData = data; return this; };
    return res;
};

/** Helper: Create mock next function */
const createMockNext = () => {
    let called = false;
    const mockFn = () => { called = true; };
    mockFn.wasCalled = () => called;
    return mockFn;
};

/**
 * Error Handler - API Errors Test Suite
 * @description Tests for APIError, NotFoundError, and custom errors.
 */
describe('Error Handler - API Errors', () => {

    let originalConsoleError;
    beforeEach(() => { originalConsoleError = console.error; console.error = () => { }; });
    afterEach(() => { console.error = originalConsoleError; });

    describe('APIError Handling', () => {
        it('should include field details', () => {
            const error = new APIError('VALIDATION_ERROR', 'Invalid field', 400);
            error.field = 'email';
            error.value = 'invalid@';
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.jsonData.details.field).toBe('email');
            expect(res.jsonData.details.value).toBe('invalid@');
        });

        it('should include resource details', () => {
            const error = new NotFoundError('User');
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(404);
            expect(res.jsonData.details.resource).toBe('User');
        });
    });

    describe('Custom Errors with statusCode', () => {
        it('should handle error with statusCode property', () => {
            const error = new Error('Custom error');
            error.statusCode = 418;
            error.error = 'TEAPOT';
            error.details = { info: 'I am a teapot' };
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(418);
            expect(res.jsonData.error).toBe('TEAPOT');
            expect(res.jsonData.details).toEqual({ info: 'I am a teapot' });
        });

        it('should use default error code if missing', () => {
            const error = new Error('Error without code');
            error.statusCode = 400;
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.jsonData.error).toBe('API_ERROR');
        });

        it('should use empty details if missing', () => {
            const error = new Error('Error');
            error.statusCode = 400;
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.jsonData).not.toHaveProperty('details');
        });
    });

});
