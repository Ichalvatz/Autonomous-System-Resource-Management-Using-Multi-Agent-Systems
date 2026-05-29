/**
 * Validation Utilities
 * Common validation functions used across the application
 */

import { MIN_PASSWORD_LENGTH, MIN_RATING, MAX_RATING } from '../config/constants.js';

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Object with isValid and errors array
 */
export const validatePassword = (password) => {
  const errors = [];
  
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'] };
  }
  
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate rating value
 * @param {number} rating - Rating to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidRating = (rating) => {
  return typeof rating === 'number' && 
         Number.isInteger(rating) && 
         rating >= MIN_RATING && 
         rating <= MAX_RATING;
};

/**
 * Validate coordinates
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidCoordinates = (latitude, longitude) => {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
};

/**
 * Validate user ID
 * @param {any} userId - User ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidUserId = (userId) => {
  const parsed = Number.parseInt(userId, 10);
  return Number.isFinite(parsed) && parsed > 0;
};

/**
 * Validate place ID
 * @param {any} placeId - Place ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidPlaceId = (placeId) => {
  const parsed = Number.parseInt(placeId, 10);
  return Number.isFinite(parsed) && parsed > 0;
};

/**
 * Validate profile ID
 * @param {any} profileId - Profile ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidProfileId = (profileId) => {
  const parsed = Number.parseInt(profileId, 10);
  return Number.isFinite(parsed) && parsed > 0;
};

/**
 * Sanitize string input (trim and limit length)
 * @param {string} input - String to sanitize
 * @param {number} maxLength - Maximum length (default: 1000)
 * @returns {string} Sanitized string
 */
export const sanitizeString = (input, maxLength = 1000) => {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input.trim().substring(0, maxLength);
};

/**
 * Validate required fields in an object
 * @param {Object} obj - Object to validate
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Object} Object with isValid and missing array
 */
export const validateRequiredFields = (obj, requiredFields) => {
  const missing = [];
  
  for (const field of requiredFields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing
  };
};

/**
 * Validate array of strings
 * @param {any} arr - Array to validate
 * @returns {boolean} True if valid array of strings, false otherwise
 */
export const isValidStringArray = (arr) => {
  return Array.isArray(arr) && arr.every(item => typeof item === 'string');
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  // Basic phone validation (digits, spaces, +, -, ())
  const phoneRegex = /^[\d\s\-+()]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate date format (ISO 8601)
 * @param {string} date - Date string to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const isValidDate = (date) => {
  if (!date || typeof date !== 'string') {
    return false;
  }
  const parsedDate = new Date(date);
  return parsedDate instanceof Date && !isNaN(parsedDate.getTime());
};

export default {
  isValidEmail,
  validatePassword,
  isValidRating,
  isValidCoordinates,
  isValidUserId,
  isValidPlaceId,
  isValidProfileId,
  sanitizeString,
  validateRequiredFields,
  isValidStringArray,
  isValidPhone,
  isValidUrl,
  isValidDate
};
