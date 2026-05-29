/**
 * Authentication Service
 * Business logic for user authentication (login, signup, token generation)
 */

import bcrypt from 'bcryptjs';
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
