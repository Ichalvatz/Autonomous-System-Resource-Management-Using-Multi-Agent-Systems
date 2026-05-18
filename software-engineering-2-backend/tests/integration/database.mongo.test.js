/**
 * @fileoverview Database Integration Tests
 * @description This test suite validates the database connection, counter operations,
 * data management, and database seeding functionality using an in-memory MongoDB.
 * 
 * @module tests/integration/database.mongo.test
 * @requires mongodb-memory-server
 * @requires ../../config/database
 * @requires ../../models/index
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest as _jest } from '@jest/globals';
import db from '../../config/database.js';
import models from '../../models/index.js';
import seedData from '../../config/seedData.js';

_jest.setTimeout(30000);

let mongod;

/**
 * Database Integration Tests
 * @description Tests for database connection, counters, data management, and seeding.
 */
describe('Database Integration Tests', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
  });

  afterAll(async () => {
    try {
      await db.disconnectDB();
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      if (mongod) {
        await mongod.stop();
      }
    }
  });

  beforeEach(async () => {
    // Ensure clean state before each test
    try {
      await db.clearAllData();
    } catch {
      // DB might not be connected yet, ignore
    }
  });

  describe('Database Connection', () => {
    test('should connect to MongoDB successfully', async () => {
      process.env.DISABLE_SEEDING = 'true';
      await expect(db.connectDB()).resolves.not.toThrow();
    });
  });

  describe('Counter Operations', () => {
    beforeEach(async () => {
      process.env.DISABLE_SEEDING = 'true';
      await db.connectDB();
    });

    test('should increment counter IDs sequentially', async () => {
      const counterName = 'testCounter';
      const first = await db.getNextId(counterName);
      const second = await db.getNextId(counterName);

      expect(second).toBe(first + 1);
      expect(typeof first).toBe('number');
      expect(typeof second).toBe('number');
    });

    test('should maintain separate counters for different entities', async () => {
      // Request sequence for both counters and ensure they increment independently
      const userCounter1 = await db.getNextId('userCounter');
      const placeCounter1 = await db.getNextId('placeCounter');

      // Advance user counter only
      const userCounter2 = await db.getNextId('userCounter');

      // Read the place counter directly from DB to ensure it was not affected
      const placeDoc = await models.Counter.findOne({ name: 'placeCounter' });

      expect(userCounter2).toBe(userCounter1 + 1);
      expect(placeDoc).toBeDefined();
      expect(placeDoc.value).toBe(placeCounter1);
    });
  });

  describe('Data Management', () => {
    beforeEach(async () => {
      process.env.DISABLE_SEEDING = 'true';
      await db.connectDB();
    });

    test('should clear all data from database', async () => {
      // Create test data
      await models.User.create({
        userId: 9999,
        name: 'Tester',
        email: 'tester@example.com',
        password: 'pass'
      });

      let count = await models.User.countDocuments();
      expect(count).toBeGreaterThan(0);

      // Clear all data
      await db.clearAllData();

      count = await models.User.countDocuments();
      expect(count).toBe(0);
    });
  });

  describe('Database Seeding', () => {
    test('should seed initial data when enabled and DB is empty', async () => {
      // Disconnect and reconnect with seeding enabled
      await db.disconnectDB();
      await db.clearAllData();
      process.env.DISABLE_SEEDING = 'false';

      await db.connectDB();

      const userCount = await models.User.countDocuments();
      expect(userCount).toBe(seedData.users.length);

      // Verify data integrity
      const users = await models.User.find({});
      expect(users).toHaveLength(seedData.users.length);
      expect(users[0]).toHaveProperty('email');
    });

    test('should not seed data when disabled', async () => {
      await db.disconnectDB();
      await db.clearAllData();
      process.env.DISABLE_SEEDING = 'true';

      await db.connectDB();

      const userCount = await models.User.countDocuments();
      expect(userCount).toBe(0);
    });
  });
});
