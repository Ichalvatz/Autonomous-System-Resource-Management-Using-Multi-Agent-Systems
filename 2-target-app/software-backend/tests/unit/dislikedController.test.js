/**
 * @fileoverview Unit Tests for Disliked Controller
 * @module tests/unit/dislikedController.test 
 * Tests controller error handling by mocking the db module
 * to throw errors, which triggers the next(error) paths.
 */

import { jest } from '@jest/globals';

// Mock the db module
const mockFindUserById = jest.fn();
const mockFindPlaceById = jest.fn();
const mockGetDislikedPlaces = jest.fn();
const mockAddDislikedPlace = jest.fn();
const mockRemoveDislikedPlace = jest.fn();

jest.unstable_mockModule('../../config/db.js', () => ({
    default: {
        findUserById: mockFindUserById,
        findPlaceById: mockFindPlaceById,
        getDislikedPlaces: mockGetDislikedPlaces,
        addDislikedPlace: mockAddDislikedPlace,
        removeDislikedPlace: mockRemoveDislikedPlace
    }
}));

// Import controller after mocking
const dislikedController = (await import('../../controllers/dislikedController.js')).default;

describe('Disliked Controller - Error Handling', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            params: { userId: '1', dislikedId: '1' },
            body: { placeId: 1 }
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        mockNext = jest.fn();
    });

    describe('getDislikedPlaces', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await dislikedController.getDislikedPlaces(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.getDislikedPlaces throws', async () => {
            const testError = new Error('Query failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetDislikedPlaces.mockRejectedValue(testError);

            await dislikedController.getDislikedPlaces(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('addDislikedPlace', () => {
        it('should call next with error when db operations throw', async () => {
            const testError = new Error('Database error');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockFindPlaceById.mockResolvedValue({ placeId: 1 });
            mockAddDislikedPlace.mockRejectedValue(testError);

            await dislikedController.addDislikedPlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('removeDislikedPlace', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await dislikedController.removeDislikedPlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.removeDislikedPlace throws', async () => {
            const testError = new Error('Delete failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockRemoveDislikedPlace.mockRejectedValue(testError);

            await dislikedController.removeDislikedPlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });
});
