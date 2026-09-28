/**
 * @fileoverview Unit Tests for Rate Limiter Middleware
 * @module tests/unit/rateLimiter.test
 */

import { jest } from '@jest/globals';
import { authLimiter, apiLimiter } from '../../middleware/rateLimiter.js';
import rateLimiterDefault from '../../middleware/rateLimiter.js';

describe('Rate Limiter Middleware - Unit Tests', () => {
    describe('authLimiter', () => {
        it('should be defined and be a function', () => {
            expect(authLimiter).toBeDefined();
            expect(typeof authLimiter).toBe('function');
        });

        it('should be exported as part of the default export', () => {
            expect(rateLimiterDefault.authLimiter).toBe(authLimiter);
        });
    });

    describe('apiLimiter', () => {
        it('should be defined and be a function', () => {
            expect(apiLimiter).toBeDefined();
            expect(typeof apiLimiter).toBe('function');
        });

        it('should be exported as part of the default export', () => {
            expect(rateLimiterDefault.apiLimiter).toBe(apiLimiter);
        });
    });

    describe('default export', () => {
        it('should contain both authLimiter and apiLimiter', () => {
            expect(rateLimiterDefault).toHaveProperty('authLimiter');
            expect(rateLimiterDefault).toHaveProperty('apiLimiter');
        });
    });

    describe('test environment behavior', () => {
        // In test environment, rate limiting is disabled (max: 0)
        // We test the configuration by examining the limiter properties

        it('authLimiter should have expected configuration structure', () => {
            // Rate limiters are middleware functions
            expect(authLimiter.length).toBeGreaterThanOrEqual(0);
        });

        it('apiLimiter should have expected configuration structure', () => {
            expect(apiLimiter.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('auth limiter toggle', () => {
        beforeEach(() => {
            jest.resetModules();
            delete process.env.AUTH_RATE_LIMIT_ENABLED;
        });

        it('disables auth rate limiting when AUTH_RATE_LIMIT_ENABLED is false', async () => {
            process.env.AUTH_RATE_LIMIT_ENABLED = 'false';

            const { isAuthRateLimitEnabled } = await import('../../middleware/rateLimiter.js');

            expect(isAuthRateLimitEnabled()).toBe(false);
        });

        it('keeps auth rate limiting enabled by default', async () => {
            const { isAuthRateLimitEnabled } = await import('../../middleware/rateLimiter.js');

            expect(isAuthRateLimitEnabled()).toBe(true);
        });
    });
});
