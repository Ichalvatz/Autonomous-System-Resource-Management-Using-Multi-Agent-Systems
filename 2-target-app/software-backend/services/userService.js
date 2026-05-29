/**
 * User Service
 * Business logic for user profile and settings management
 */

import db from '../config/db.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';
import { isValidEmail, isValidUserId } from '../utils/validators.js';
import { sanitizeUser, pick } from '../utils/helpers.js';

/**
 * Get user profile by ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User data without password
 */
export const getUserProfile = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const user = await db.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return sanitizeUser(user);
};

/**
 * Update user profile
 * @param {number} userId - User ID
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserProfile = async (userId, updateData) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Check if user exists
  const user = await db.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Validate email if provided
  if (updateData.email && !isValidEmail(updateData.email)) {
    throw new ValidationError('Invalid email format', 'email');
  }

  // Only allow specific fields to be updated
  const allowedFields = ['name', 'email', 'phone', 'dateOfBirth', 'activeProfile', 'location'];
  const updates = pick(updateData, allowedFields);

  // Check if email is already in use by another user
  if (updates.email) {
    const existingUser = await db.findUserByEmail(updates.email);
    if (existingUser && existingUser.userId !== userId) {
      throw new ConflictError('Email is already in use by another account', 'email');
    }
  }

  // Update user
  const updatedUser = await db.updateUserById(userId, updates);

  return sanitizeUser(updatedUser);
};

/**
 * Get user settings
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User settings
 */
export const getUserSettings = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Check if user exists
  const user = await db.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  return await db.getSettings(userId);
};

/**
 * Update user settings
 * @param {number} userId - User ID
 * @param {Object} settingsData - Settings to update
 * @returns {Promise<Object>} Updated settings
 */

// Allowed settings fields (supports both frontend and backend field names)
const SETTINGS_FIELDS = [
  'preferredLanguage', 'language', 'emailNotifications',
  'pushNotifications', 'accessibilitySettings', 'privacySettings',
  'userAgreementAccepted'
];

/**
 * Build updates object from settings data using field whitelist
 * @param {Object} settingsData - Settings data from request
 * @returns {Object} Filtered updates object
 */
const buildSettingsUpdates = (settingsData) =>
  Object.fromEntries(
    SETTINGS_FIELDS
      .filter(field => settingsData[field] !== undefined)
      .map(field => [field, settingsData[field]])
  );

export const updateUserSettings = async (userId, settingsData) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  // Check if user exists
  const user = await db.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Build updates using field whitelist pattern
  const updates = buildSettingsUpdates(settingsData);

  return await db.updateSettings(userId, updates);
};

/**
 * Delete user account
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if successful
 */
export const deleteUser = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const user = await db.findUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Delete user and related data
  await db.deleteUserById(userId);

  return true;
};

/**
 * Get all users (admin only)
 * @returns {Promise<Array>} Array of users without passwords
 */
export const getAllUsers = async () => {
  const users = await db.getAllUsers();
  return users.map(sanitizeUser);
};

export default {
  getUserProfile,
  updateUserProfile,
  getUserSettings,
  updateUserSettings,
  deleteUser,
  getAllUsers
};
