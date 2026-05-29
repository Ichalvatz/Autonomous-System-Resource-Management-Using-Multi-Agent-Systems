/**
 * Middleware Barrier File
 * Centralizes middleware exports for cleaner imports
 */

import errorHandler from './errorHandler.js';
import { requestLogger } from './logger.js';
import requestId from './requestId.js';

export {
    errorHandler,
    requestLogger,
    requestId
};
