/**
 * Custom Error Classes
 * Provides specific error types for better error handling throughout the application
 */

/**
 * Base API Error class
 */
class APIError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - 400
 * Used when request data fails validation
 */
class ValidationError extends APIError {
  constructor(message, field = null, value = null) {
    super(message, 400);
    this.error = 'VALIDATION_ERROR';
    this.field = field;
    this.value = value;
  }
}

/**
 * Authentication Error - 401
 * Used when authentication fails or is missing
 */
class AuthenticationError extends APIError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.error = 'AUTHENTICATION_ERROR';
  }
}

/**
 * Authorization Error - 403
 * Used when user lacks permission for an action
 */
class AuthorizationError extends APIError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403);
    this.error = 'AUTHORIZATION_ERROR';
  }
}

/**
 * Not Found Error - 404
 * Used when a resource doesn't exist
 */
class NotFoundError extends APIError {
  constructor(resource, identifier = null) {
    const message = identifier 
      ? `${resource} with ID ${identifier} not found`
      : `${resource} not found`;
    super(message, 404);
    this.error = 'NOT_FOUND';
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Conflict Error - 409
 * Used when there's a conflict with existing data (e.g., duplicate email)
 */
class ConflictError extends APIError {
  constructor(message, field = null) {
    super(message, 409);
    this.error = 'CONFLICT';
    this.field = field;
  }
}

/**
 * Internal Server Error - 500
 * Used for unexpected server errors
 */
class InternalServerError extends APIError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500);
    this.error = 'INTERNAL_SERVER_ERROR';
  }
}

export {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalServerError
};
