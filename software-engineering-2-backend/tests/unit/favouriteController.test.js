/**
 * @fileoverview Unit Tests for Favourite Controller
 * @module tests/unit/favouriteController.test 
 * Tests controller error handling by mocking the db module
 * to throw errors, which triggers the next(error) paths.
 */

import { jest } from '@jest/globals';

// Mock the db module
const mockFindUserById = jest.fn();
const mockFindPlaceById = jest.fn();
const mockGetFavouritePlaces = jest.fn();
const mockAddFavouritePlace = jest.fn();
const mockRemoveFavouritePlace = jest.fn();
const mockGetReviewsForPlace = jest.fn();

jest.unstable_mockModule('../../config/db.js', () => ({
    default: {
        findUserById: mockFindUserById,
        findPlaceById: mockFindPlaceById,
        getFavouritePlaces: mockGetFavouritePlaces,
        addFavouritePlace: mockAddFavouritePlace,
        removeFavouritePlace: mockRemoveFavouritePlace,
        getReviewsForPlace: mockGetReviewsForPlace
    }
}));

// Import controller after mocking
const favouriteController = (await import('../../controllers/favouriteController.js')).default;

describe('Favourite Controller - Error Handling', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            params: { userId: '1', favouriteId: '1' },
            body: { placeId: 1 }
        };

        mockRes = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        mockNext = jest.fn();
    });

    describe('getFavouritePlaces', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await favouriteController.getFavouritePlaces(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.json).not.toHaveBeenCalled();
        });

        it('should call next with error when db.getFavouritePlaces throws', async () => {
            const testError = new Error('Query failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockGetFavouritePlaces.mockRejectedValue(testError);

            await favouriteController.getFavouritePlaces(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('addFavouritePlace', () => {
        it('should call next with error when db operations throw', async () => {
            const testError = new Error('Database error');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockFindPlaceById.mockResolvedValue({ placeId: 1, toObject: () => ({ placeId: 1 }) });
            mockAddFavouritePlace.mockResolvedValue({ favouriteId: 1 });
            mockGetReviewsForPlace.mockRejectedValue(testError);

            await favouriteController.addFavouritePlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });

    describe('removeFavouritePlace', () => {
        it('should call next with error when db.findUserById throws', async () => {
            const testError = new Error('Database connection failed');
            mockFindUserById.mockRejectedValue(testError);

            await favouriteController.removeFavouritePlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });

        it('should call next with error when db.removeFavouritePlace throws', async () => {
            const testError = new Error('Delete failed');
            mockFindUserById.mockResolvedValue({ userId: 1 });
            mockRemoveFavouritePlace.mockRejectedValue(testError);

            await favouriteController.removeFavouritePlace(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
        });
    });
});
