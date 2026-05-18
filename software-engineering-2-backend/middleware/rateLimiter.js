/**
 * Rate Limiting Middleware
 * @description Configurable rate limiters to protect API endpoints
 */
import rateLimit from 'express-rate-limit';

// --- Time Constants ---
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

/**
 * Factory to create a consistent rate limiter
 * @param {Object} options - Limiter configuration
 * @returns {Function} Express middleware
 */
const createLimiter = ({ windowMs, max, messageText, ...extraOptions }) => {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'TOO_MANY_REQUESTS', message: messageText },
        ...extraOptions
    });
};

/** Authentication rate limiter (15 min window, skips successful) */
export const authLimiter = createLimiter({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    messageText: 'Too many auth attempts',
    skipSuccessfulRequests: true
});

/** API rate limiter (1 min window) */
export const apiLimiter = createLimiter({
    windowMs: ONE_MINUTE,
    max: 100,
    messageText: 'Too many requests'
});

export default { authLimiter, apiLimiter };

