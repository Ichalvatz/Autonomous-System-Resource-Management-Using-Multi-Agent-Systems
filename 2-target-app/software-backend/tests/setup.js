/**
 * Jest Test Setup File
 * Configures the test environment, loads test environment variables,
 * and manages database connections for testing
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import models from '../models/index.js';

// Load test environment variables from .env.test
dotenv.config({ path: '.env.test' });

// Check if we're using MongoDB for tests
const useMongoDB = process.env.USE_MONGODB === 'true';

/**
 * Setup database connection before all tests
 */
beforeAll(async () => {
  if (useMongoDB) {
    // Connect to test MongoDB database
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in .env.test file');
    }

    try {
      await mongoose.connect(mongoURI);
      console.log('✓ Test MongoDB Connected Successfully');
      console.log(`  Database: ${mongoose.connection.name}`);
    } catch (error) {
      console.error('✗ Test MongoDB Connection Error:', error.message);
      throw error;
    }
  } else {
    console.log('⚠️  Using in-memory database for tests');
  }
});

/**
 * Clean up data before each test to ensure test isolation
 */
beforeEach(async () => {
  if (useMongoDB) {
    // Clear all collections before each test
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } else {
    // If using in-memory database, it will be reset automatically
    // by the in-memory implementation on each import
    // No action needed here
  }
});

/**
 * Optional: Clean up after each test
 */
afterEach(async () => {
  // Additional cleanup if needed
  // For now, beforeEach handles the cleanup
});

/**
 * Close database connections after all tests complete
 */
afterAll(async () => {
  if (useMongoDB && mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      console.log('✓ Test MongoDB Disconnected');
    } catch (error) {
      console.error('✗ Error disconnecting from test MongoDB:', error.message);
      throw error;
    }
  }
});

/**
 * Helper function to create test counters for auto-incrementing IDs
 * This ensures proper ID generation in tests when using MongoDB
 */
export const initializeCounters = async () => {
  if (useMongoDB) {
    const counters = [
      { name: 'userId', value: 0 },
      { name: 'placeId', value: 0 },
      { name: 'profileId', value: 0 },
      { name: 'reviewId', value: 0 },
      { name: 'reportId', value: 0 }
    ];
    await models.Counter.insertMany(counters);
  }
};

/**
 * Helper function to clear all test data
 * Useful for explicit cleanup in specific tests
 */
export const clearTestData = async () => {
  if (useMongoDB) {
    await models.User.deleteMany({});
    await models.Place.deleteMany({});
    await models.PreferenceProfile.deleteMany({});
    await models.Review.deleteMany({});
    await models.Report.deleteMany({});
    await models.FavouritePlace.deleteMany({});
    await models.DislikedPlace.deleteMany({});
    await models.Settings.deleteMany({});
    await models.Counter.deleteMany({});
  }
};
