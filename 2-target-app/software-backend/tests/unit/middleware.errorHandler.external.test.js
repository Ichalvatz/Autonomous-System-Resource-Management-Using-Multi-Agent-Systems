/**
 * @fileoverview Error Handler Middleware - External Error Tests
 * @description This test suite validates error handling for MongoDB errors,
 * JWT errors, and generic 500 internal server errors.
 * 
 * @module tests/unit/middleware.errorHandler.external.test
 * @requires ../../middleware/errorHandler
 */

import errorHandler from '../../middleware/errorHandler.js';

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
 * Error Handler - External Errors Test Suite
 * @description Tests for MongoDB, JWT, and generic errors.
 */
describe('Error Handler - External Errors', () => {

    let originalConsoleError;
    beforeEach(() => { originalConsoleError = console.error; console.error = () => { }; });
    afterEach(() => { console.error = originalConsoleError; });

    describe('MongoDB Errors', () => {
        it('should handle duplicate key error (11000)', () => {
            const error = { code: 11000, keyPattern: { email: 1 } };
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(409);
            expect(res.jsonData.error).toBe('DUPLICATE_KEY');
            expect(res.jsonData.details.field).toBe('email');
        });

        it('should handle duplicate key without keyPattern', () => {
            const error = { code: 11000 };
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(409);
            expect(res.jsonData.details.field).toBeUndefined();
        });
    });

    describe('Mongoose Validation Errors', () => {
        it('should handle ValidationError', () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            error.details = { field: 'age', message: 'Must be positive' };
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(400);
            expect(res.jsonData.error).toBe('VALIDATION_ERROR');
        });

        it('should handle ValidationError without details', () => {
            const error = new Error('Validation failed');
            error.name = 'ValidationError';
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.jsonData.details).toBeUndefined();
        });
    });

    describe('JWT Errors', () => {
        it('should handle JsonWebTokenError', () => {
            const error = new Error('Invalid token');
            error.name = 'JsonWebTokenError';
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('INVALID_TOKEN');
        });

        it('should handle TokenExpiredError', () => {
            const error = new Error('Token expired');
            error.name = 'TokenExpiredError';
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('TOKEN_EXPIRED');
        });
    });

    describe('Generic Errors (500)', () => {
        it('should return 500 for unknown errors', () => {
            const error = new Error('Something unexpected happened');
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            errorHandler(error, req, res, next);
            expect(res.statusCode).toBe(500);
            expect(res.jsonData.error).toBe('INTERNAL_SERVER_ERROR');
            process.env.NODE_ENV = originalEnv;
        });

        it('should include stack trace in development mode', () => {
            const error = new Error('Dev error');
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            errorHandler(error, req, res, next);
            expect(res.jsonData.stack).toBeDefined();
            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('Console Logging', () => {
        it('should log the error to console', () => {
            let errorLogged = false, loggedMessage = null;
            const originalError = console.error;
            console.error = (msg) => { errorLogged = true; loggedMessage = msg; };
            const error = new Error('Test error');
            const req = createMockReq(), res = createMockRes(), next = createMockNext();
            errorHandler(error, req, res, next);
            expect(errorLogged).toBe(true);
            expect(loggedMessage).toBe('Error:');
            console.error = originalError;
        });
    });

});
