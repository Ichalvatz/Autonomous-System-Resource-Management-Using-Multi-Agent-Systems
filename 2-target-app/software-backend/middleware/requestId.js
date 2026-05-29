/**
 * Request ID Middleware
 * Generates unique request IDs for tracing and log correlation
 */

import { randomUUID } from 'crypto';

/**
 * Attaches a unique request ID to each incoming request
 * ID is available as req.id and returned in X-Request-ID response header
 * If client provides X-Request-ID header, it will be reused for tracing
 */
export const requestId = (req, res, next) => {
    const id = req.headers['x-request-id'] || randomUUID();
    req.id = id;
    res.setHeader('X-Request-ID', id);
    next();
};

export default requestId;
