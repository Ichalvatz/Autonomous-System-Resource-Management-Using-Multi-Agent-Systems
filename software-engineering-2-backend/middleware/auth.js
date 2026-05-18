/**
 * Authentication Middleware
 * Validates JWT tokens and checks user permissions
 */

import jwt from 'jsonwebtoken';
import { USER_ROLES } from '../config/constants.js';

/**
 * Verify JWT token and attach user info to request
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next function
 */
export const authenticate = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid authentication token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Authentication token has expired'
      });
    }

    return res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * User authentication middleware
 * Validates JWT tokens and ensures users can only access their own resources
 */
export const userAuth = (req, res, next) => {
  authenticate(req, res, (err) => {
    if (err) return next(err);

    // If the route has a userId parameter, verify it matches the authenticated user
    if (req.params.userId) {
      const requestedUserId = Number.parseInt(req.params.userId, 10);
      if (!Number.isFinite(requestedUserId)) {
        return res.status(400).json({
          error: 'INVALID_USER_ID',
          message: 'User ID must be a valid integer'
        });
      }

      if (requestedUserId !== req.user.userId) {
        const isProd = process.env.NODE_ENV === 'production';
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'You can only access your own resources',
          ...(isProd ? {} : { details: { authenticatedUserId: req.user.userId, requestedUserId } })
        });
      }
    }

    next();
  });
};

/**
 * Admin authentication middleware
 * Validates JWT tokens for admin-only endpoints
 */
export const adminAuth = (req, res, next) => {
  authenticate(req, res, (err) => {
    if (err) return next(err);

    // Check if user is admin
    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'Administrator access required for this operation',
        details: {
          requiredRole: USER_ROLES.ADMIN,
          providedRole: req.user.role || USER_ROLES.USER
        }
      });
    }

    // Attach admin info to request
    req.admin = req.user;
    next();
  });
};

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export const optionalAuth = (req, _, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    // Ignore token errors for optional auth (reference variable to satisfy linter)
    void error;
  }

  next();
};

export default {
  authenticate,
  userAuth,
  adminAuth,
  optionalAuth
};
