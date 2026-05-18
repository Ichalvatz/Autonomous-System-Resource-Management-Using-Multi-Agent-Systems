/**
 * @fileoverview Unit Tests for Preference Controller
 * @module tests/unit/preferenceController.test 
 * Tests controller error handling by mocking the db module
 * to throw errors, which triggers the next(error) paths.
 */

import { jest } from '@jest/globals';

// Mock the db module
const mockFindUserById = jest.fn();
const mockGetPreferenceProfiles = jest.fn();
const mockGetPreferenceProfile = jest.fn();
const mockAddPreferenceProfile = jest.fn();
const mockUpdatePreferenceProfile = jest.fn();
const mockDeletePreferenceProfile = jest.fn();
const mockUpdateUserById = jest.fn();

jest.unstable_mockModule('../../config/db.js', () => ({
    default: {
        findUserById: mockFindUserById,
        getPreferenceProfiles: mockGetPreferenceProfiles,
        getPreferenceProfile: mockGetPreferenceProfile,
        addPreferenceProfile: mockAddPreferenceProfile,
        updatePreferenceProfile: mockUpdatePreferenceProfile,
        deletePreferenceProfile: mockDeletePreferenceProfile,
        updateUserById: mockUpdateUserById
    }
}));

// Import controller after mocking to ensure mocks are in place
const preferenceController = (await import('../../controllers/preferenceController.js')).default;

/**
 * Test suite for preference controller error handling paths.
 * Verifies that database errors are properly passed to next() middleware.
 */
describe('Preference Controller - Error Handling', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    // Reset mocks and create fresh request/response objects
    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            params: { userId: '1', profileId: '1' },
            body: { categories: ['MUSEUM'] }
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        mockNext = jest.fn();
    });

    describe('getPreferenceProfiles', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await preferenceController.getPreferenceProfiles(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should call next with error when db.getPreferenceProfiles throws', async () => {
            const testError = new Error('Query failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetPreferenceProfiles.mockRejectedValue(testError);

            await preferenceController.getPreferenceProfiles(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('createPreferenceProfile', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await preferenceController.createPreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.addPreferenceProfile throws', async () => {
            const testError = new Error('Insert failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetPreferenceProfiles.mockResolvedValue([]);
            mockAddPreferenceProfile.mockRejectedValue(testError);

            await preferenceController.createPreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('updatePreferenceProfile', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);
            mockReq.body = { name: 'Updated' };

            await preferenceController.updatePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.updatePreferenceProfile throws', async () => {
            const testError = new Error('Update failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetPreferenceProfile.mockResolvedValue({ profileId: 1, categories: ['MUSEUM'] });
            mockUpdatePreferenceProfile.mockRejectedValue(testError);
            mockReq.body = { name: 'Updated' };

            await preferenceController.updatePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('deletePreferenceProfile', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await preferenceController.deletePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.deletePreferenceProfile throws', async () => {
            const testError = new Error('Delete failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockDeletePreferenceProfile.mockRejectedValue(testError);

            await preferenceController.deletePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('activatePreferenceProfile', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await preferenceController.activatePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.getPreferenceProfiles throws', async () => {
            const testError = new Error('Query failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetPreferenceProfiles.mockRejectedValue(testError);

            await preferenceController.activatePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.updateUserById throws', async () => {
            const testError = new Error('Update failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            // First call returns profile to find
            mockGetPreferenceProfiles.mockResolvedValueOnce([{ profileId: 1, categories: ['MUSEUM'] }]);
            mockUpdateUserById.mockRejectedValue(testError);

            await preferenceController.activatePreferenceProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });
});
