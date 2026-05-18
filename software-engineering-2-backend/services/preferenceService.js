/**
 * @fileoverview Preference Service
 * @description Business logic for user preference profiles including CRUD operations.
 * Handles validation, error handling, and database interactions for preference management.
 * 
 * @module services/preferenceService
 * @requires ../config/db
 * @requires ../utils/errors
 * @requires ../utils/validators
 */

import db from '../config/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { isValidUserId, isValidProfileId } from '../utils/validators.js';

/**
 * Gets all preference profiles for a user.
 * @param {number} userId - The user's ID
 * @returns {Promise<Array>} Array of preference profiles
 * @throws {ValidationError} If userId is invalid
 */
export const getPreferenceProfiles = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  return await db.getPreferenceProfiles(userId);
};

export const getPreferenceProfile = async (userId, profileId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidProfileId(profileId)) {
    throw new ValidationError('Invalid profile ID');
  }

  const profile = await db.getPreferenceProfile(userId, profileId);
  if (!profile) {
    throw new NotFoundError('Preference Profile', profileId);
  }

  return profile;
};

export const createPreferenceProfile = async (userId, profileData) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  return await db.addPreferenceProfile({ userId, ...profileData });
};

export const updatePreferenceProfile = async (userId, profileId, updateData) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidProfileId(profileId)) {
    throw new ValidationError('Invalid profile ID');
  }

  const profile = await db.getPreferenceProfile(userId, profileId);
  if (!profile) {
    throw new NotFoundError('Preference Profile', profileId);
  }

  return await db.updatePreferenceProfile(userId, profileId, updateData);
};

export const deletePreferenceProfile = async (userId, profileId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidProfileId(profileId)) {
    throw new ValidationError('Invalid profile ID');
  }

  const profile = await db.getPreferenceProfile(userId, profileId);
  if (!profile) {
    throw new NotFoundError('Preference Profile', profileId);
  }

  return await db.deletePreferenceProfile(userId, profileId);
};

export default {
  getPreferenceProfiles,
  getPreferenceProfile,
  createPreferenceProfile,
  updatePreferenceProfile,
  deletePreferenceProfile
};
