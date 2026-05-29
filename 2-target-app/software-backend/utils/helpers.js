/**
 * Helper Utilities
 * Common helper functions used across the application
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Remove password field from user object
 * @param {Object} user - User object
 * @returns {Object} User object without password
 */
export const sanitizeUser = (user) => {
  if (!user) return null;
  
  const userObj = user.toObject ? user.toObject() : user;
  const result = { ...userObj };
  delete result.password;
  return result;
};

/**
 * Remove sensitive fields from multiple users
 * @param {Array} users - Array of user objects
 * @returns {Array} Array of sanitized user objects
 */
export const sanitizeUsers = (users) => {
  if (!Array.isArray(users)) return [];
  return users.map(sanitizeUser);
};

/**
 * Parse pagination parameters
 * @param {Object} query - Query parameters
 * @param {number} defaultPage - Default page number
 * @param {number} defaultPageSize - Default page size
 * @param {number} maxPageSize - Maximum page size
 * @returns {Object} Parsed pagination parameters
 */
export const parsePagination = (query, defaultPage = 1, defaultPageSize = 20, maxPageSize = 100) => {
  let page = parseInt(query.page) || defaultPage;
  let pageSize = parseInt(query.pageSize) || defaultPageSize;
  
  // Ensure minimum values
  page = Math.max(1, page);
  pageSize = Math.max(1, Math.min(pageSize, maxPageSize));
  
  const skip = (page - 1) * pageSize;
  
  return { page, pageSize, skip };
};

/**
 * Sleep for specified milliseconds (for testing/delays)
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Check if object is empty
 * @param {Object} obj - Object to check
 * @returns {boolean} True if empty, false otherwise
 */
export const isEmptyObject = (obj) => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Format date to ISO string
 * @param {Date|string} date - Date to format
 * @returns {string} ISO formatted date string
 */
export const formatDate = (date) => {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
};

/**
 * Pick specific fields from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} fields - Fields to pick
 * @returns {Object} New object with only specified fields
 */
export const pick = (obj, fields) => {
  const result = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, field)) {
      result[field] = obj[field];
    }
  }
  return result;
};

/**
 * Omit specific fields from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} fields - Fields to omit
 * @returns {Object} New object without specified fields
 */
export const omit = (obj, fields) => {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
};

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export const capitalize = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Generate a slug from text
 * @param {string} text - Text to slugify
 * @returns {string} Slugified text
 */
export const slugify = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Check if value is numeric
 * @param {any} value - Value to check
 * @returns {boolean} True if numeric, false otherwise
 */
export const isNumeric = (value) => {
  return !isNaN(parseFloat(value)) && isFinite(value);
};

/**
 * Truncate string to specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add if truncated (default: '...')
 * @returns {string} Truncated string
 */
export const truncate = (str, length, suffix = '...') => {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= length) return str;
  return str.substring(0, length - suffix.length) + suffix;
};

export default {
  calculateDistance,
  sanitizeUser,
  sanitizeUsers,
  parsePagination,
  sleep,
  randomInt,
  isEmptyObject,
  deepClone,
  formatDate,
  pick,
  omit,
  capitalize,
  slugify,
  isNumeric,
  truncate
};
