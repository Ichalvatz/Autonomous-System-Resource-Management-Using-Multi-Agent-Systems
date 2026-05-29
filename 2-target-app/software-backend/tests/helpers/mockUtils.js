/**
 * @fileoverview Mock Utilities for Unit Tests
 * @module tests/helpers/mockUtils
 * Provides reusable mock creators for Express req/res objects
 */

/**
 * Creates a mock Express Response object for unit tests.
 * Tracks status codes, JSON data, and send calls for assertions.
 * 
 * @returns {Object} Mock response object with status, json, and send methods
 * 
 * @example
 * const res = createMockRes();
 * sendSuccess(res, { data: 'test' });
 * expect(res.statusCode).toBe(200);
 * expect(res.jsonData.success).toBe(true);
 */
export const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.jsonData = null;
    res.sendCalled = false;

    res.status = function (code) {
        this.statusCode = code;
        return this;
    };

    res.json = function (data) {
        this.jsonData = data;
        return this;
    };

    res.send = function () {
        this.sendCalled = true;
        return this;
    };

    return res;
};

/**
 * Creates a mock Express Request object for unit tests.
 * Useful for testing middleware functions.
 * 
 * @param {string|null} authHeader - Authorization header value (e.g., 'Bearer token')
 * @param {Object} params - Request params object
 * @returns {Object} Mock request object with headers and params
 * 
 * @example
 * const req = createMockReq('Bearer validtoken', { userId: '123' });
 * userAuth(req, res, next);
 */
export const createMockReq = (authHeader = null, params = {}) => ({
    headers: {
        authorization: authHeader
    },
    params
});

export default {
    createMockRes,
    createMockReq
};
