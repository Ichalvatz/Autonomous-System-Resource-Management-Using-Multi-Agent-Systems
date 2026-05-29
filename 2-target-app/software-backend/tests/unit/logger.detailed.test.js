/**
 * @fileoverview Unit Tests for Detailed Logger Middleware
 * @description This test suite validates the detailed logging middleware that
 * captures request information including method, path, query, body, and headers.
 * 
 * @module tests/unit/logger.detailed.test
 * @requires ../../middleware/logger
 */

import { detailedLogger } from '../../middleware/logger.js';

/**
 * Detailed Logger Middleware Test Suite
 * @description Tests for detailed request/response logging functionality.
 */
describe('Detailed Logger Middleware', () => {
    let consoleLogSpy;
    let originalConsoleLog;

    beforeEach(() => {
        originalConsoleLog = console.log;
        const logs = [];
        console.log = (...args) => {
            logs.push(args.join(' '));
        };
        consoleLogSpy = logs;
    });

    afterEach(() => {
        console.log = originalConsoleLog;
    });

    it('should log detailed request information', (done) => {
        const req = {
            method: 'POST',
            path: '/api/detailed',
            query: { page: '1', limit: '10' },
            body: { name: 'test' },
            headers: { 'content-type': 'application/json' }
        };

        const res = {
            statusCode: 200,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(5);

                        // Check for incoming request log
                        const logs = consoleLogSpy.join(' ');
                        expect(logs).toContain('Incoming Request');
                        expect(logs).toContain('Method: POST');
                        expect(logs).toContain('Path: /api/detailed');
                        expect(logs).toContain('Response');
                        expect(logs).toContain('Status: 200');
                        expect(logs).toContain('Duration:');

                        done();
                    }, 10);
                }
            }
        };

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        detailedLogger(req, res, next);
        expect(nextCalled).toBe(true);
    });

    it('should log query parameters', () => {
        const req = {
            method: 'GET',
            path: '/api/search',
            query: { search: 'test', filter: 'active' },
            body: {},
            headers: {}
        };

        const res = {
            statusCode: 200,
            on: () => { }
        };

        const next = () => { };
        detailedLogger(req, res, next);

        const logs = consoleLogSpy.join(' ');
        expect(logs).toContain('Query:');
    });

    it('should log request body', () => {
        const req = {
            method: 'POST',
            path: '/api/create',
            query: {},
            body: { username: 'testuser', email: 'test@example.com' },
            headers: {}
        };

        const res = {
            statusCode: 201,
            on: () => { }
        };

        const next = () => { };
        detailedLogger(req, res, next);

        const logs = consoleLogSpy.join(' ');
        expect(logs).toContain('Body:');
    });

    it('should log request headers', () => {
        const req = {
            method: 'GET',
            path: '/api/info',
            query: {},
            body: {},
            headers: { 'user-agent': 'jest-test', 'accept': 'application/json' }
        };

        const res = {
            statusCode: 200,
            on: () => { }
        };

        const next = () => { };
        detailedLogger(req, res, next);

        const logs = consoleLogSpy.join(' ');
        expect(logs).toContain('Headers:');
    });
});
