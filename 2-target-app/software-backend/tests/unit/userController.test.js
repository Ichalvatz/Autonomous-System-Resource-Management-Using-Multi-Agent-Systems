/**
 * @fileoverview Unit Tests for User Controller
 * @module tests/unit/userController.test 
 * Tests controller error handling by mocking the userService
 * to throw errors, which triggers the next(error) paths.
 */

import { jest } from '@jest/globals';

// Mock the userService module
const mockGetUserProfile = jest.fn();
const mockUpdateUserProfile = jest.fn();
const mockGetUserSettings = jest.fn();
const mockUpdateUserSettings = jest.fn();

jest.unstable_mockModule('../../services/userService.js', () => ({
    getUserProfile: mockGetUserProfile,
    updateUserProfile: mockUpdateUserProfile,
    getUserSettings: mockGetUserSettings,
    updateUserSettings: mockUpdateUserSettings,
    default: {
        getUserProfile: mockGetUserProfile,
        updateUserProfile: mockUpdateUserProfile,
        getUserSettings: mockGetUserSettings,
        updateUserSettings: mockUpdateUserSettings
    }
}));

// Import controller after mocking to ensure mocks are in place
const userController = (await import('../../controllers/userController.js')).default;

/**
 * Test suite for user controller error handling paths.
 * Verifies that service errors are properly passed to next() middleware.
 */
describe('User Controller - Error Handling', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    // Reset mocks and create fresh request/response objects
    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            params: { userId: '1' },
            body: {}
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };

        mockNext = jest.fn();
    });

    describe('getUserProfile', () => {
        it('should call next with error when userService throws', async () => {
            const testError = new Error('Database connection failed');
            mockGetUserProfile.mockRejectedValue(testError);

            await userController.getUserProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should return user profile on success', async () => {
            const mockUser = { userId: 1, name: 'Test User', email: 'test@example.com' };
            mockGetUserProfile.mockResolvedValue(mockUser);

            await userController.getUserProfile(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        user: mockUser
                    })
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('updateUserProfile', () => {
        it('should call next with error when userService throws', async () => {
            const testError = new Error('Update failed');
            mockUpdateUserProfile.mockRejectedValue(testError);
            mockReq.body = { name: 'New Name' };

            await userController.updateUserProfile(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should return updated user on success', async () => {
            const mockUpdatedUser = { userId: 1, name: 'Updated Name' };
            mockUpdateUserProfile.mockResolvedValue(mockUpdatedUser);
            mockReq.body = { name: 'Updated Name' };

            await userController.updateUserProfile(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'User profile updated successfully'
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('getSettings', () => {
        it('should call next with error when userService throws', async () => {
            const testError = new Error('Settings fetch failed');
            mockGetUserSettings.mockRejectedValue(testError);

            await userController.getSettings(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should return settings on success', async () => {
            const mockSettings = { userId: 1, preferredLanguage: 'ENGLISH' };
            mockGetUserSettings.mockResolvedValue(mockSettings);

            await userController.getSettings(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        settings: mockSettings
                    })
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('updateSettings', () => {
        it('should call next with error when userService throws', async () => {
            const testError = new Error('Settings update failed');
            mockUpdateUserSettings.mockRejectedValue(testError);
            mockReq.body = { preferredLanguage: 'GREEK' };

            await userController.updateSettings(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should return updated settings on success', async () => {
            const mockUpdatedSettings = { userId: 1, preferredLanguage: 'GREEK' };
            mockUpdateUserSettings.mockResolvedValue(mockUpdatedSettings);
            mockReq.body = { preferredLanguage: 'GREEK' };

            await userController.updateSettings(mockReq, mockRes, mockNext);

            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    message: 'User settings updated successfully'
                })
            );
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
