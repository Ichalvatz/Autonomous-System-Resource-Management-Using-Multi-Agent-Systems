/**
 * Middleware Barrel File
 * Centralizes middleware exports for cleaner imports
 */

import errorHandler from './errorHandler.js';
import { requestLogger } from './logger.js';
import requestId from './requestId.js';
import { metricsMiddleware, metricsHandler } from './metrics.js';
import {
  structuredLogger,
  errorLogger,
  performanceMonitor,
  requestBodyLogger,
  setupAsyncOperationLogger
} from './structuredLogger.js';

export {
  errorHandler,
  requestLogger,
  requestId,
  metricsMiddleware,
  metricsHandler,
  structuredLogger,
  errorLogger,
  performanceMonitor,
  requestBodyLogger,
  setupAsyncOperationLogger
};
