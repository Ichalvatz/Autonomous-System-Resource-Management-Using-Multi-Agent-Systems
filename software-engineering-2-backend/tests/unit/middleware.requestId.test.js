/**
 * @fileoverview Request ID Middleware Tests
 * @module tests/unit/middleware.requestId.test
 * @requires ../../middleware/requestId
 */

import requestId from '../../middleware/requestId.js';
import { jest } from '@jest/globals';

describe('Request ID Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = { headers: {} };
        res = {
            setHeader: jest.fn()
        };
        next = jest.fn();
    });

    it('should generate a new request ID if none is provided', () => {
        requestId(req, res, next);

        expect(req.id).toBeDefined();
        expect(typeof req.id).toBe('string');
        expect(req.id.length).toBeGreaterThan(0);
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
        expect(next).toHaveBeenCalled();
    });

    it('should use the provided X-Request-ID header if present', () => {
        const existingId = 'existing-uuid-123';
        req.headers['x-request-id'] = existingId;

        requestId(req, res, next);

        expect(req.id).toBe(existingId);
        expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', existingId);
        expect(next).toHaveBeenCalled();
    });
});
