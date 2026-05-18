/**
 * @fileoverview Infrastructure Tests - Database
 * @module tests/unit/infrastructure.db.test 
 * Tests for database connection and MongoDB API wrapper:
 * - Database connection (config/database.js)
 * - MongoDB API (config/mongoDb.js)
 */

import { jest } from '@jest/globals';

describe('Infrastructure - Database Connection', () => {

    let connectDB;
    let mockMongoose;
    let originalEnv;
    let consoleErrorSpy;

    beforeEach(async () => {
        // Save original env
        originalEnv = { ...process.env };
        // Silence expected console.error output during tests
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        // Mock mongoose
        mockMongoose = {
            connect: jest.fn(),
            connection: {
                name: 'test-db',
                close: jest.fn()
            },
            disconnect: jest.fn()
        };

        // Mock the mongoose module
        jest.unstable_mockModule('mongoose', () => ({
            default: mockMongoose
        }));

        // Mock models to avoid real DB operations
        jest.unstable_mockModule('../../models/index.js', () => ({
            default: {
                User: { countDocuments: jest.fn().mockResolvedValue(0) },
                Place: { countDocuments: jest.fn().mockResolvedValue(0) }
            }
        }));

        // Mock seedData
        jest.unstable_mockModule('../../config/seedData.js', () => ({
            default: {
                users: [],
                places: []
            }
        }));
    });

    afterEach(() => {
        // Restore env
        process.env = originalEnv;
        if (consoleErrorSpy && typeof consoleErrorSpy.mockRestore === 'function') {
            consoleErrorSpy.mockRestore();
        }
        jest.resetModules();
    });

    describe('connectDB()', () => {

        it('must connect to MongoDB successfully', async () => {
            process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
            process.env.DISABLE_SEEDING = 'true';

            mockMongoose.connect.mockResolvedValue(undefined);

            const database = await import('../../config/database.js');
            connectDB = database.connectDB || database.default?.connectDB;

            await connectDB();

            expect(mockMongoose.connect).toHaveBeenCalledWith('mongodb://localhost:27017/test');
        });

        it('must throw error when MONGODB_URI is missing', async () => {
            delete process.env.MONGODB_URI;
            process.env.DISABLE_SEEDING = 'true';

            const database = await import('../../config/database.js');
            connectDB = database.connectDB || database.default?.connectDB;

            await expect(connectDB()).rejects.toThrow('MONGODB_URI is not defined');
        });

        it('must handle connection errors', async () => {
            process.env.MONGODB_URI = 'mongodb://invalid:27017/test';
            process.env.DISABLE_SEEDING = 'true';

            const connectionError = new Error('Connection failed');
            mockMongoose.connect.mockRejectedValue(connectionError);

            const database = await import('../../config/database.js');
            connectDB = database.connectDB || database.default?.connectDB;

            await expect(connectDB()).rejects.toThrow('Connection failed');
        });

        it('must return early if already connected', async () => {
            process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
            process.env.DISABLE_SEEDING = 'true';

            mockMongoose.connect.mockResolvedValue(undefined);

            const database = await import('../../config/database.js');
            connectDB = database.connectDB || database.default?.connectDB;

            // First connection
            await connectDB();
            expect(mockMongoose.connect).toHaveBeenCalledTimes(1);

            // Second connection should skip
            await connectDB();
            expect(mockMongoose.connect).toHaveBeenCalledTimes(1); // Still 1
        });

    });

});

describe('Infrastructure - MongoDB API Wrapper', () => {

    let mongoDb;
    let mockModels;

    beforeEach(async () => {
        // Mock models
        mockModels = {
            Place: {
                findOne: jest.fn(),
                find: jest.fn()
            },
            User: {
                findOne: jest.fn(),
                create: jest.fn()
            },
            Review: {
                find: jest.fn()
            },
            PreferenceProfile: {
                find: jest.fn(),
                findOne: jest.fn(),
                findOneAndUpdate: jest.fn(),
                deleteOne: jest.fn()
            }
        };

        jest.unstable_mockModule('../../models/index.js', () => ({
            default: mockModels
        }));

        const mongoDbModule = await import('../../config/mongoDb.js');
        mongoDb = mongoDbModule.default;
    });

    afterEach(() => {
        jest.resetModules();
    });

    describe('Place API', () => {

        it('findPlaceById must call Place.findOne', async () => {
            const mockPlace = { placeId: 1, name: 'Test Place' };
            mockModels.Place.findOne.mockResolvedValue(mockPlace);

            const result = await mongoDb.findPlaceById(1);

            expect(mockModels.Place.findOne).toHaveBeenCalledWith({ placeId: 1 });
            expect(result).toEqual(mockPlace);
        });

        it('getReviewsForPlace must call Review.find', async () => {
            const mockReviews = [{ reviewId: 1 }, { reviewId: 2 }];
            mockModels.Review.find.mockResolvedValue(mockReviews);

            const result = await mongoDb.getReviewsForPlace(1);

            expect(mockModels.Review.find).toHaveBeenCalledWith({ placeId: 1 });
            expect(result).toEqual(mockReviews);
        });

    });

    describe('User API', () => {

        it('findUserById must call User.findOne', async () => {
            const mockUser = { userId: 1, name: 'Test User' };
            mockModels.User.findOne.mockResolvedValue(mockUser);

            const result = await mongoDb.findUserById(1);

            expect(mockModels.User.findOne).toHaveBeenCalledWith({ userId: 1 });
            expect(result).toEqual(mockUser);
        });

        it('findUserByEmail must call User.findOne', async () => {
            const mockUser = { userId: 1, email: 'test@test.com' };
            mockModels.User.findOne.mockResolvedValue(mockUser);

            const result = await mongoDb.findUserByEmail('test@test.com');

            expect(mockModels.User.findOne).toHaveBeenCalledWith({ email: 'test@test.com' });
            expect(result).toEqual(mockUser);
        });

    });

    describe('Preference Profile API', () => {

        it('getPreferenceProfiles must call PreferenceProfile.find', async () => {
            const mockProfiles = [{ profileId: 1 }, { profileId: 2 }];
            mockModels.PreferenceProfile.find.mockResolvedValue(mockProfiles);

            const result = await mongoDb.getPreferenceProfiles(1);

            expect(mockModels.PreferenceProfile.find).toHaveBeenCalledWith({ userId: 1 });
            expect(result).toEqual(mockProfiles);
        });

        it('updatePreferenceProfile must call findOneAndUpdate', async () => {
            const mockProfile = { profileId: 1, userId: 1, categories: ['food'] };
            mockModels.PreferenceProfile.findOneAndUpdate.mockResolvedValue(mockProfile);

            const result = await mongoDb.updatePreferenceProfile(1, 1, { categories: ['food'] });

            expect(mockModels.PreferenceProfile.findOneAndUpdate).toHaveBeenCalled();
            expect(result).toEqual(mockProfile);
        });

        it('deletePreferenceProfile must call deleteOne', async () => {
            mockModels.PreferenceProfile.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await mongoDb.deletePreferenceProfile(1, 1);

            expect(mockModels.PreferenceProfile.deleteOne).toHaveBeenCalledWith({ userId: 1, profileId: 1 });
            expect(result).toBe(true);
        });

    });

});
