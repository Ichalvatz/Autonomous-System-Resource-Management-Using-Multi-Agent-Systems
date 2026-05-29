/**
 * Authentication Controller
 * Handles HTTP requests for user authentication
 */

import * as authService from '../services/authService.js';
import { SUCCESS_MESSAGES, HTTP_STATUS } from '../config/constants.js';

/**
 * Login user
 * POST /auth/login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Call service to handle business logic
    const result = await authService.loginUser(email, password);
    
    res.json({
      success: true,
      data: {
        token: result.token,
        user: result.user
      },
      message: SUCCESS_MESSAGES.LOGIN,
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register new user
 * POST /auth/signup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    
    // Call service to handle business logic
    const result = await authService.registerUser({ name, email, password });
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        token: result.token,
        user: result.user
      },
      message: SUCCESS_MESSAGES.SIGNUP,
      error: null
    });
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  signup
};

