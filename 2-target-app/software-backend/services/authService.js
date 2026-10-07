/**
 * Authentication Service
 * Business logic for user authentication (login, signup, token generation)
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  isValidEmail,
  validatePassword,
  sanitizeUser
} from '../utils/index.js';
import { JWT_EXPIRES_IN } from '../config/constants.js';

// =============================================================================
// Feature flag FEATURE_LOGIN_AUDIT (off by default). Added 2026-10-03 for the thesis
// "bad configuration change" experiment: enabling it is the change that breaks the app.
// It derives a session fingerprint for an audit trail with PBKDF2 at 1,500,000 iterations,
// synchronously on the request path: a key-derivation setting meant for offline use, applied
// by mistake to every login. Every login then costs ~0.35 s of CPU (5x) and blocks the event
// loop, so even an idle pod misses the 0.35 s p95 objective and more pods cannot fix it.
// (Calibrated 2026-10-03 before any agent run: at 600k / 1M iterations, 3 pods still met the
// objective, so scaling alone would have "fixed" it at 3x the cost.)
// The bad state lives in the deployment's configuration, not in the process: restarting
// or adding pods does not remove it; only rolling the configuration back does.
// =============================================================================
const LOGIN_AUDIT_ENABLED = process.env.FEATURE_LOGIN_AUDIT === 'true';
const LOGIN_AUDIT_ITERATIONS = parseInt(process.env.LOGIN_AUDIT_ITERATIONS || '1500000', 10);
if (LOGIN_AUDIT_ENABLED) {
  console.log(`[${new Date().toISOString()}] [INFO] [config] - feature login-audit enabled (pbkdf2-sha256, ${LOGIN_AUDIT_ITERATIONS} iterations)`);
}

const auditFingerprint = (userId) =>
  crypto.pbkdf2Sync(`${userId}:${Date.now()}`, 'audit-trail', LOGIN_AUDIT_ITERATIONS, 32, 'sha256').toString('hex');

// =============================================================================
// Validation Helpers - Reduce complexity by extracting validation logic
// =============================================================================

/**
 * Validate login input fields
 * @param {string} email - User email
 * @param {string} password - User password
 * @throws {ValidationError} If validation fails
 */
const validateLoginInput = (email, password) => {
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format');
  }
};

/**
 * Validate registration input fields
 * @param {Object} userData - Registration data
 * @throws {ValidationError} If validation fails
 */
const validateRegistrationInput = ({ name, email, password }) => {
  if (!name || !email || !password) {
    throw new ValidationError('All fields are required');
  }
  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format', 'email');
  }
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new ValidationError(passwordValidation.errors[0], 'password');
  }
};

/**
 * Assert password is valid
 * @param {string} password - Password to validate
 * @param {string} field - Field name for error context
 * @throws {ValidationError} If password is invalid
 */
const assertPasswordValid = (password, field = 'password') => {
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new ValidationError(passwordValidation.errors[0], field);
  }
};

// =============================================================================
// Authentication Functions
// =============================================================================

/**
 * Authenticate user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Object containing token and user data
 */
export const loginUser = async (email, password) => {
  validateLoginInput(email, password);

  const user = await db.findUserByEmail(email);
  if (!user?.password) {
    if (user) console.error(`User ${email} found but has no password field`);
    throw new AuthenticationError('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid email or password');
  }
  if (LOGIN_AUDIT_ENABLED) {
    auditFingerprint(user.id);
  }

  return { token: generateToken(user), user: sanitizeUser(user) };
};

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Object containing token and user data
 */
export const registerUser = async ({ name, email, password }) => {
  validateRegistrationInput({ name, email, password });

  const existingUser = await db.findUserByEmail(email);
  if (existingUser) {
    throw new ConflictError('User with this email already exists', 'email');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await db.createUser({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
    role: 'user',
    preferences: { categories: [], tags: [] },
    location: { latitude: null, longitude: null }
  });

  return { token: generateToken(newUser), user: sanitizeUser(newUser) };
};

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Authentication token has expired');
    }
    throw new AuthenticationError('Invalid authentication token');
  }
};

/**
 * Change user password
 * @param {number} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<boolean>} True if successful
 */
export const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await db.findUserById(userId);
  if (!user) {
    throw new AuthenticationError('User not found');
  }

  const isValid = await bcrypt.compare(oldPassword, user.password);
  if (!isValid) {
    throw new AuthenticationError('Current password is incorrect');
  }

  assertPasswordValid(newPassword, 'newPassword');

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await db.updateUserById(userId, { password: hashedPassword });

  return true;
};

export default {
  loginUser,
  registerUser,
  verifyToken,
  changePassword
};
