/**
 * Validation Middleware
 * Request validation utilities using express-validator
 */

import { validationResult } from 'express-validator';
import { sendValidationError } from '../utils/responses.js';

/**
 * Validate request and handle validation errors
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value
    }));
    
    return sendValidationError(res, 'Validation failed', { errors: errorMessages });
  }
  
  next();
};

export default validate;
