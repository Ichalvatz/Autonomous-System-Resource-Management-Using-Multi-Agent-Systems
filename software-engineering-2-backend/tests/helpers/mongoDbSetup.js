/**
 * @fileoverview MongoDB Test Setup Utilities
 * @module tests/helpers/mongoDbSetup
 * Provides shared setup/teardown functions for MongoDB unit tests
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { jest as _jest } from '@jest/globals';
import db from '../../config/database.js';

_jest.setTimeout(30000);

/** @type {MongoMemoryServer|null} */
let mongod = null;

/**
 * Initializes the in-memory MongoDB server and connects the database.
 * Call this in beforeAll().
 * 
 * @returns {Promise<void>}
 */
export const setupMongoDb = async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.DISABLE_SEEDING = 'true';
    await db.connectDB();
};

/**
 * Cleans up the database connection and stops the in-memory server.
 * Call this in afterAll().
 * 
 * @returns {Promise<void>}
 */
export const teardownMongoDb = async () => {
    try {
        await db.clearAllData();
        await db.disconnectDB();
    } catch (error) {
        console.error('Cleanup error:', error);
    } finally {
        if (mongod) {
            await mongod.stop();
        }
    }
};

/**
 * Clears all data between tests.
 * Call this in beforeEach().
 * 
 * @returns {Promise<void>}
 */
export const clearMongoDbData = async () => {
    await db.clearAllData();
};

export default {
    setupMongoDb,
    teardownMongoDb,
    clearMongoDbData
};
