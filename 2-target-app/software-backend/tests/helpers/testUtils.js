/**
 * Test Utilities and Helpers
 * Provides reusable test helpers, fixtures, and API client for integration tests
 */

import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import db from '../../config/db.js';

/**
 * Supertest API client
 * Use this to make HTTP requests to the Express app in tests
 * 
 * Example usage:
 *   const response = await api.get('/users/1/profile');
 *   expect(response.status).toBe(200);
 */
export const api = request(app);

/**
 * Default test user data
 * Can be used as a base for creating test users
 */
export const defaultTestUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'TestPassword123!',
  role: 'user',
  preferences: {
    categories: [],
    tags: []
  },
  location: {
    latitude: null,
    longitude: null
  }
};

/**
 * Default admin test user data
 */
export const defaultAdminUser = {
  name: 'Admin User',
  email: 'admin@example.com',
  password: 'AdminPassword123!',
  role: 'admin',
  preferences: {
    categories: [],
    tags: []
  },
  location: {
    latitude: null,
    longitude: null
  }
};

/**
 * Create a test user in the database
 * 
 * @param {Object} overrides - Optional properties to override default user data
 * @returns {Promise<Object>} The created user object
 * 
 * Example:
 *   const user = await createTestUser({ name: 'John Doe', email: 'john@example.com' });
 */
export const createTestUser = async (overrides = {}) => {
  const userData = { ...defaultTestUser, ...overrides };

  // Hash the password if provided
  if (userData.password) {
    userData.password = await bcrypt.hash(userData.password, 10);
  }

  // Create user via database
  const user = await db.createUser(userData);

  return user;
};

/**
 * Create an admin test user in the database
 * 
 * @param {Object} overrides - Optional properties to override default admin data
 * @returns {Promise<Object>} The created admin user object
 */
export const createTestAdmin = async (overrides = {}) => {
  return await createTestUser({ ...defaultAdminUser, ...overrides });
};

/**
 * Generate a JWT token for a user
 * Uses the same logic as the auth service
 * 
 * @param {Object} user - User object containing userId, email, and role
 * @returns {string} JWT token
 * 
 * Example:
 *   const token = generateTestJWT({ userId: 1, email: 'test@example.com', role: 'user' });
 */
export const generateTestJWT = (user) => {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // Use a longer expiration for tests
  );
};

/**
 * Generate an expired JWT token for testing
 * Useful for testing token expiry handling
 * 
 * @param {Object} user - User object containing userId, email, and role
 * @returns {string} Expired JWT token
 * 
 * Example:
 *   const expiredToken = generateExpiredToken({ userId: 1, email: 'test@example.com', role: 'user' });
 */
export const generateExpiredToken = (user) => {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '-1h' } // Already expired
  );
};

/**
 * Create an authenticated request with Authorization header
 * Returns a Supertest request object with the Authorization header set
 * 
 * @param {string} token - JWT token
 * @returns {Object} Supertest request object with auth header
 * 
 * Example:
 *   const user = await createTestUser();
 *   const token = generateTestJWT(user);
 *   const response = await authRequest(token).get('/users/1/profile');
 */
export const authRequest = (token) => {
  return {
    get: (url) => api.get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => api.post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => api.put(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => api.patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => api.delete(url).set('Authorization', `Bearer ${token}`)
  };
};

/**
 * Create a test user and return both user and token
 * Convenience function that combines user creation and token generation
 * 
 * @param {Object} overrides - Optional properties to override default user data
 * @returns {Promise<Object>} Object containing { user, token }
 * 
 * Example:
 *   const { user, token } = await createAuthenticatedUser();
 *   const response = await authRequest(token).get(`/users/${user.userId}/profile`);
 */
export const createAuthenticatedUser = async (overrides = {}) => {
  const user = await createTestUser(overrides);
  const token = generateTestJWT(user);

  return { user, token };
};

/**
 * Create a test admin user and return both user and token
 * 
 * @param {Object} overrides - Optional properties to override default admin data
 * @returns {Promise<Object>} Object containing { user, token }
 */
export const createAuthenticatedAdmin = async (overrides = {}) => {
  const admin = await createTestAdmin(overrides);
  const token = generateTestJWT(admin);

  return { user: admin, token };
};

/**
 * Create a test place in the database
 * 
 * @param {Object} overrides - Optional properties to override default place data
 * @returns {Promise<Object>} The created place object
 */
export const createTestPlace = async (overrides = {}) => {
  // TODO: Implement based on your Place model structure
  // This is a placeholder that should be customized based on your actual Place schema
  const placeData = {
    name: 'Test Place',
    description: 'A test place for testing purposes',
    category: 'restaurant',
    tags: ['test'],
    location: {
      latitude: 40.6401,
      longitude: 22.9444
    },
    address: '123 Test Street',
    ...overrides
  };

  // Use your actual database method to create a place
  // Example: await db.createPlace(placeData);
  // For now, returning the data structure
  return placeData;
};

/**
 * Wait for a specified amount of time
 * Useful for testing async operations or rate limiting
 * 
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 * 
 * Example:
 *   await wait(1000); // Wait for 1 second
 */
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract cookies from a response
 * 
 * @param {Object} response - Supertest response object
 * @returns {Object} Object containing parsed cookies
 */
export const extractCookies = (response) => {
  const cookies = {};
  const setCookieHeader = response.headers['set-cookie'];

  if (setCookieHeader) {
    setCookieHeader.forEach(cookie => {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      cookies[name.trim()] = value;
    });
  }

  return cookies;
};

/**
 * Test fixtures for common scenarios
 */
export const fixtures = {
  // Valid user registration data
  validUserRegistration: {
    name: 'New User',
    email: 'newuser@example.com',
    password: 'ValidPassword123!'
  },

  // Invalid user registration data
  invalidUserRegistration: {
    name: '',
    email: 'invalid-email',
    password: '123' // Too short
  },

  // Valid login credentials (matches defaultTestUser)
  validLoginCredentials: {
    email: 'test@example.com',
    password: 'TestPassword123!'
  },

  // Invalid login credentials
  invalidLoginCredentials: {
    email: 'wrong@example.com',
    password: 'WrongPassword123!'
  }
};

/**
 * Helper to verify HATEOAS links in response
 * 
 * @param {Object} response - API response object
 * @param {Array<string>} expectedLinks - Array of expected link keys
 * @returns {boolean} True if all expected links are present
 */
export const verifyHATEOASLinks = (response, expectedLinks) => {
  if (!response.links) {
    return false;
  }

  return expectedLinks.every(linkName => {
    const link = response.links[linkName];
    return link && link.href && link.method;
  });
};

/**
 * Setup admin and regular test users for admin integration tests.
 * Returns both users with their tokens for reuse across test files.
 * 
 * @param {Object} options - Optional configuration
 * @param {number} options.adminUserId - Admin user ID (default: 9001)
 * @param {number} options.regularUserId - Regular user ID (default: 9002)
 * @returns {Promise<Object>} Object containing { adminUser, adminToken, regularUser, regularToken }
 * 
 * @example
 * let adminUser, adminToken, regularUser, regularToken;
 * beforeEach(async () => {
 *   ({ adminUser, adminToken, regularUser, regularToken } = await setupAdminTestUsers());
 * });
 */
export const setupAdminTestUsers = async (options = {}) => {
  const { adminUserId = 9001, regularUserId = 9002 } = options;

  // Create Admin User with role: 'admin'
  const adminAuth = await createAuthenticatedUser({
    userId: adminUserId,
    username: 'admin',
    email: 'admin@test.com',
    role: 'admin'
  });

  // Create Regular User with role: 'user'
  const regularAuth = await createAuthenticatedUser({
    userId: regularUserId,
    username: 'regular',
    email: 'regular@test.com',
    role: 'user'
  });

  return {
    adminUser: adminAuth.user,
    adminToken: adminAuth.token,
    regularUser: regularAuth.user,
    regularToken: regularAuth.token
  };
};

export default {
  api,
  authRequest,
  createTestUser,
  createTestAdmin,
  createAuthenticatedUser,
  createAuthenticatedAdmin,
  createTestPlace,
  generateTestJWT,
  generateExpiredToken,
  wait,
  extractCookies,
  fixtures,
  verifyHATEOASLinks,
  setupAdminTestUsers
};
