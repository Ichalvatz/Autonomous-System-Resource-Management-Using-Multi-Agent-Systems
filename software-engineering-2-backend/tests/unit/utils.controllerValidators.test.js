/**
 * @fileoverview Controller Validators Utility Tests
 * @module tests/unit/utils.controllerValidators.test
 * @requires ../../utils/controllerValidators
 */

import { jest } from '@jest/globals';

// Mock dependencies before importing the module under test
jest.unstable_mockModule('../../config/db.js', () => ({
    __esModule: true,
    default: {
        findUserById: jest.fn(),
        findPlaceById: jest.fn()
    }
}));

jest.unstable_mockModule('../../utils/responseBuilder.js', () => ({
    __esModule: true,
    default: {
        notFound: jest.fn(),
        badRequest: jest.fn()
    }
}));

// Dynamic imports to ensure mocks are applied
const { requireUser, requirePlace, requireUserAndPlace } = await import('../../utils/controllerValidators.js');
const { default: db } = await import('../../config/db.js');
const { default: R } = await import('../../utils/responseBuilder.js');

describe('Controller Validators', () => {
    let res;

    // Reset mocks before each test
    beforeEach(() => {
        res = {};
        jest.clearAllMocks();
    });

    // Test requireUser validator function
    describe('requireUser', () => {
        it('should return user if found', async () => {
            const user = { id: 1, name: 'Test User' };
            db.findUserById.mockResolvedValue(user);

            const result = await requireUser(res, 1);
            expect(result).toEqual(user);
            expect(R.notFound).not.toHaveBeenCalled();
        });

        it('should return null and call notFound if user not found', async () => {
            db.findUserById.mockResolvedValue(null);

            const result = await requireUser(res, 1);
            expect(result).toBeNull();
            expect(R.notFound).toHaveBeenCalledWith(res, 'USER_NOT_FOUND', expect.any(String));
        });
    });

    describe('requirePlace', () => {
        it('should return place if found', async () => {
            const place = { id: 1, name: 'Test Place' };
            db.findPlaceById.mockResolvedValue(place);

            const result = await requirePlace(res, 1);
            expect(result).toEqual(place);
            expect(R.notFound).not.toHaveBeenCalled();
        });

        it('should return null and call notFound if place not found', async () => {
            db.findPlaceById.mockResolvedValue(null);

            const result = await requirePlace(res, 1);
            expect(result).toBeNull();
            expect(R.notFound).toHaveBeenCalledWith(res, 'PLACE_NOT_FOUND', expect.any(String));
        });
    });

    describe('requireUserAndPlace', () => {
        it('should return user and place if both found', async () => {
            const user = { id: 1 };
            const place = { id: 2 };
            db.findUserById.mockResolvedValue(user);
            db.findPlaceById.mockResolvedValue(place);

            const result = await requireUserAndPlace(res, 1, 2);
            expect(result).toEqual({ user, place });
        });

        it('should return null and call badRequest if placeId is missing', async () => {
            const result = await requireUserAndPlace(res, 1, null);
            expect(result).toBeNull();
            expect(R.badRequest).toHaveBeenCalledWith(res, 'INVALID_INPUT', expect.any(String), expect.any(Object));
        });

        it('should return null and call notFound if user not found', async () => {
            db.findUserById.mockResolvedValue(null);
            db.findPlaceById.mockResolvedValue({ id: 2 });

            const result = await requireUserAndPlace(res, 1, 2);
            expect(result).toBeNull();
            expect(R.notFound).toHaveBeenCalledWith(res, 'USER_OR_PLACE_NOT_FOUND', expect.any(String));
        });

        it('should return null and call notFound if place not found', async () => {
            db.findUserById.mockResolvedValue({ id: 1 });
            db.findPlaceById.mockResolvedValue(null);

            const result = await requireUserAndPlace(res, 1, 2);
            expect(result).toBeNull();
            expect(R.notFound).toHaveBeenCalledWith(res, 'USER_OR_PLACE_NOT_FOUND', expect.any(String));
        });
    });
});
