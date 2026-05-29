/**
 * @fileoverview Unit Tests for Request Logger Middleware
 * @description This test suite validates the basic request logging middleware
 * including color-coded status output and duration measurement.
 * 
 * @module tests/unit/logger.request.test
 * @requires ../../middleware/logger
 */

import { requestLogger } from '../../middleware/logger.js';

/**
 * Request Logger Middleware Test Suite
 * @description Tests for basic request logging functionality.
 */
describe('Request Logger Middleware', () => {
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

    it('should log request when response finishes', (done) => {
        const req = {
            method: 'GET',
            path: '/api/test'
        };

        const res = {
            statusCode: 200,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(0);
                        const logMessage = consoleLogSpy[0];
                        expect(logMessage).toContain('GET');
                        expect(logMessage).toContain('/api/test');
                        expect(logMessage).toContain('200');
                        done();
                    }, 10);
                }
            }
        };

        let nextCalled = false;
        const next = () => {
            nextCalled = true;
        };

        requestLogger(req, res, next);
        expect(nextCalled).toBe(true);
    });

    it('should use yellow color for 4xx status codes', (done) => {
        const req = {
            method: 'POST',
            path: '/api/error'
        };

        const res = {
            statusCode: 404,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(0);
                        const logMessage = consoleLogSpy[0];
                        expect(logMessage).toContain('404');
                        expect(logMessage).toContain('\x1b[33m'); // Yellow color code
                        done();
                    }, 10);
                }
            }
        };

        const next = () => { };
        requestLogger(req, res, next);
    });

    it('should use red color for 5xx status codes', (done) => {
        const req = {
            method: 'DELETE',
            path: '/api/crash'
        };

        const res = {
            statusCode: 500,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(0);
                        const logMessage = consoleLogSpy[0];
                        expect(logMessage).toContain('500');
                        expect(logMessage).toContain('\x1b[31m'); // Red color code
                        done();
                    }, 10);
                }
            }
        };

        const next = () => { };
        requestLogger(req, res, next);
    });

    it('should use green color for 2xx status codes', (done) => {
        const req = {
            method: 'PUT',
            path: '/api/success'
        };

        const res = {
            statusCode: 201,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(0);
                        const logMessage = consoleLogSpy[0];
                        expect(logMessage).toContain('201');
                        expect(logMessage).toContain('\x1b[32m'); // Green color code
                        done();
                    }, 10);
                }
            }
        };

        const next = () => { };
        requestLogger(req, res, next);
    });

    it('should measure and log duration', (done) => {
        const req = {
            method: 'GET',
            path: '/api/timing'
        };

        const res = {
            statusCode: 200,
            on: (event, callback) => {
                if (event === 'finish') {
                    setTimeout(() => {
                        callback();

                        expect(consoleLogSpy.length).toBeGreaterThan(0);
                        const logMessage = consoleLogSpy[0];
                        expect(logMessage).toMatch(/\(\d+ms\)/); // Duration in ms
                        done();
                    }, 50); // Wait a bit to accumulate duration
                }
            }
        };

        const next = () => { };
        requestLogger(req, res, next);
    });
});
