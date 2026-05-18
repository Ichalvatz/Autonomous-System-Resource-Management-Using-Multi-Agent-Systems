/**
 * Standard API Response Utilities
 * Provides consistent response formatting across the application
 */

import { HTTP_STATUS } from '../config/constants.js';

/**
 * Send a success response
 * @param {Response} res - Express response object
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {Object} meta - Optional metadata (pagination, etc.)
 */
export const sendSuccess = (res, data, statusCode = HTTP_STATUS.OK, meta = null) => {
  const response = {
    success: true,
    data
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a created response (201)
 * @param {Response} res - Express response object
 * @param {Object} data - Created resource data
 * @param {string} message - Success message
 */
export const sendCreated = (res, data, message = 'Resource created successfully') => {
  return res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message,
    data
  });
};

/**
 * Send a no content response (204)
 * @param {Response} res - Express response object
 */
export const sendNoContent = (res) => {
  return res.status(HTTP_STATUS.NO_CONTENT).send();
};

/**
 * Send an error response
 * @param {Response} res - Express response object
 * @param {Object} options - Error options
 * @param {string} options.error - Error code
 * @param {string} options.message - Error message
 * @param {number} options.statusCode - HTTP status code
 * @param {Object} options.details - Optional error details
 */
export const sendError = (res, { error, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null }) => {
  const response = {
    success: false,
    error,
    message
  };

  if (details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send a validation error response (400)
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 * @param {Object} details - Validation error details
 */
export const sendValidationError = (res, message, details = null) => {
  return sendError(res, { error: 'VALIDATION_ERROR', message, statusCode: HTTP_STATUS.BAD_REQUEST, details });
};

/**
 * Send an authentication error response (401)
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 */
export const sendAuthError = (res, message = 'Authentication required') => {
  return sendError(res, { error: 'AUTHENTICATION_ERROR', message, statusCode: HTTP_STATUS.UNAUTHORIZED });
};

/**
 * Send an authorization error response (403)
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 */
export const sendForbiddenError = (res, message = 'Access denied') => {
  return sendError(res, { error: 'AUTHORIZATION_ERROR', message, statusCode: HTTP_STATUS.FORBIDDEN });
};

/**
 * Send a not found error response (404)
 * @param {Response} res - Express response object
 * @param {string} resource - Resource name
 * @param {any} identifier - Resource identifier
 */
export const sendNotFoundError = (res, resource, identifier = null) => {
  const message = identifier
    ? `${resource} with ID ${identifier} not found`
    : `${resource} not found`;
  return sendError(res, { error: 'NOT_FOUND', message, statusCode: HTTP_STATUS.NOT_FOUND });
};

/**
 * Send a conflict error response (409)
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 * @param {Object} details - Conflict details
 */
export const sendConflictError = (res, message, details = null) => {
  return sendError(res, { error: 'CONFLICT', message, statusCode: HTTP_STATUS.CONFLICT, details });
};

/**
 * Send paginated response
 * @param {Response} res - Express response object
 * @param {Object} options - Pagination options
 * @param {Array} options.items - Array of items
 * @param {number} options.page - Current page
 * @param {number} options.pageSize - Items per page
 * @param {number} options.total - Total number of items
 */
export const sendPaginatedResponse = (res, { items, page, pageSize, total }) => {
  const totalPages = Math.ceil(total / pageSize);

  return res.json({
    success: true,
    data: items,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  });
};

export default {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendError,
  sendValidationError,
  sendAuthError,
  sendForbiddenError,
  sendNotFoundError,
  sendConflictError,
  sendPaginatedResponse
};
