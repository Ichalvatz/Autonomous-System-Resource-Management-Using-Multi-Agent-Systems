/**
 * @fileoverview Centralized Error Handler Middleware
 * @module middleware/errorHandler
 * 
 * @description
 * Provides centralized error handling for the Express API. This middleware
 * catches all errors thrown in route handlers and transforms them into
 * standardized JSON responses. It handles various error types including:
 * - Custom API errors (from utils/errors.js)
 * - MongoDB duplicate key errors
 * - Mongoose validation errors
 * - JWT authentication errors
 * - Generic server errors
 * 
 * @example
 * // Register as the last middleware in Express app
 * import errorHandler from './middleware/errorHandler.js';
 * app.use(errorHandler);
 * 
 * @see {@link module:utils/errors} for custom error classes
 */

import { APIError } from '../utils/errors.js';

// =============================================================================
// Response Builders - Helper functions to create standardized error responses
// =============================================================================

/**
 * Build a standardized error response object.
 * 
 * @param {string} error - Error code identifier (e.g., 'VALIDATION_ERROR')
 * @param {string} message - Human-readable error message
 * @param {Object} [details={}] - Additional error context
 * @returns {Object} Standardized error response object
 */
const buildErrorResponse = (error, message, details = {}) => ({
  success: false,
  error,
  message,
  data: null,
  ...(Object.keys(details).length > 0 && { details })
});

// =============================================================================
// Error Type Handlers - Functions to handle specific error categories
// =============================================================================

/**
 * Handle custom APIError instances.
 * 
 * @description
 * Processes errors created with the APIError class, extracting
 * any additional context like field, value, and resource information.
 * 
 * @param {APIError} err - The APIError instance
 * @param {Object} res - Express response object
 * @returns {Object} JSON response sent to client
 */
const handleAPIError = (err, res) => {
  // Build base response with error code and message
  const response = buildErrorResponse(err.error, err.message);

  // Collect additional details if present on the error
  const details = {};
  if (err.field) details.field = err.field;
  if (err.value !== undefined) details.value = err.value;
  if (err.resource) details.resource = err.resource;

  // Add details to response if any exist
  if (Object.keys(details).length > 0) {
    response.details = details;
  }

  return res.status(err.statusCode).json(response);
};

/**
 * Handle MongoDB duplicate key errors.
 * 
 * @description
 * Handles error code 11000 from MongoDB which indicates a unique
 * constraint violation (e.g., duplicate email address).
 * 
 * @param {Object} err - MongoDB error object with keyPattern
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with 409 Conflict status
 */
const handleDuplicateKeyError = (err, res) => {
  // Extract the field name that caused the duplicate key error
  const duplicateField = Object.keys(err.keyPattern || {})[0];

  return res.status(409).json(
    buildErrorResponse(
      'DUPLICATE_KEY',
      'A record with this information already exists',
      { field: duplicateField }
    )
  );
};

/**
 * Handle Mongoose validation errors.
 * 
 * @description
 * Processes validation errors from Mongoose schema validation,
 * returning detailed information about which fields failed validation.
 * 
 * @param {Object} err - Mongoose ValidationError object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with 400 Bad Request status
 */
const handleValidationError = (err, res) => {
  return res.status(400).json(
    buildErrorResponse(
      'VALIDATION_ERROR',
      err.message,
      err.details || {}
    )
  );
};

/**
 * Handle JWT invalid token errors.
 * 
 * @description
 * Handles JsonWebTokenError thrown when a token cannot be verified,
 * such as when it has an invalid signature or is malformed.
 * 
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with 401 Unauthorized status
 */
const handleInvalidTokenError = (_, res) => {
  return res.status(401).json(
    buildErrorResponse(
      'INVALID_TOKEN',
      'Authentication token is invalid'
    )
  );
};

/**
 * Handle JWT expired token errors.
 * 
 * @description
 * Handles TokenExpiredError thrown when a valid token has
 * exceeded its expiration time.
 * 
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with 401 Unauthorized status
 */
const handleExpiredTokenError = (_, res) => {
  return res.status(401).json(
    buildErrorResponse(
      'TOKEN_EXPIRED',
      'Authentication token has expired'
    )
  );
};

/**
 * Handle legacy API errors with statusCode property.
 * 
 * @description
 * Provides backward compatibility for older error handling patterns
 * where errors have a statusCode property but are not APIError instances.
 * 
 * @param {Object} err - Error object with statusCode property
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with the error's statusCode
 */
const handleLegacyAPIError = (err, res) => {
  return res.status(err.statusCode).json(
    buildErrorResponse(
      err.error || 'API_ERROR',
      err.message,
      err.details || {}
    )
  );
};

/**
 * Handle unexpected/unknown errors.
 * 
 * @description
 * Catch-all handler for errors that don't match any known patterns.
 * In development mode, includes the stack trace for debugging.
 * 
 * @param {Error} err - Generic error object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with 500 Internal Server Error status
 */
const handleUnknownError = (err, res) => {
  const response = buildErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred'
  );

  // Include stack trace in development for debugging
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  return res.status(500).json(response);
};

// =============================================================================
// Main Error Handler Middleware
// =============================================================================

// =============================================================================
// Error Type Detection - Maps error characteristics to handler types
// =============================================================================

/**
 * Error type handlers lookup map.
 * Maps error type identifiers to their corresponding handler functions.
 */
const errorTypeHandlers = new Map([
  ['APIError', handleAPIError],
  ['DuplicateKey', handleDuplicateKeyError],
  ['ValidationError', handleValidationError],
  ['JsonWebTokenError', handleInvalidTokenError],
  ['TokenExpiredError', handleExpiredTokenError],
  ['LegacyAPIError', handleLegacyAPIError],
]);

/**
 * Determine the error type identifier for lookup.
 * 
 * @param {Error} err - The error object to classify
 * @returns {string} Error type identifier for handler lookup
 */
const getErrorType = (err) => {
  if (err instanceof APIError) return 'APIError';
  if (err.code === 11000) return 'DuplicateKey';
  if (err.statusCode) return 'LegacyAPIError';
  return err.name || 'Unknown';
};

/**
 * Express error handling middleware.
 * 
 * @description
 * Main error handler that catches all errors from route handlers and
 * middleware. It identifies the error type using a lookup map and delegates
 * to the appropriate handler function for standardized response generation.
 * 
 * Error handling order (via lookup map):
 * 1. Custom APIError instances
 * 2. MongoDB duplicate key errors (code 11000)
 * 3. Mongoose validation errors
 * 4. JWT invalid token errors
 * 5. JWT expired token errors
 * 6. Legacy API errors with statusCode
 * 7. Unknown/unexpected errors (fallback)
 * 
 * @param {Error} err - The error object thrown by a route handler
 * @param {Object} _req - Express request object (unused)
 * @param {Object} res - Express response object
 * @param {Function} _next - Express next function (unused in final handler)
 * @returns {Object} Standardized JSON error response
 * 
 * @example
 * // In route handler
 * throw new APIError('User not found', 404, 'NOT_FOUND');
 * // Will be caught and transformed to: { success: false, error: 'NOT_FOUND', ... }
 */
const errorHandler = (err, _, res, __) => {
  // Log error for server-side debugging
  console.error('Error:', err);

  // Lookup handler by error type, fallback to unknown error handler
  const errorType = getErrorType(err);
  const handler = errorTypeHandlers.get(errorType) || handleUnknownError;

  return handler(err, res);
};

export default errorHandler;
