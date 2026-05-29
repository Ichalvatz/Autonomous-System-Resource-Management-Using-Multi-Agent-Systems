// Controller validators for common resource validation patterns
import db from '../config/db.js';
import R from './responseBuilder.js';

// Validate user exists and return user or send 404 response
export const requireUser = async (res, userId) => {
    const user = await db.findUserById(userId);
    if (!user) {
        R.notFound(res, 'USER_NOT_FOUND', `User with ID ${userId} not found`);
        return null;
    }
    return user;
};

// Validate place exists and return place or send 404 response
export const requirePlace = async (res, placeId) => {
    const place = await db.findPlaceById(placeId);
    if (!place) {
        R.notFound(res, 'PLACE_NOT_FOUND', `Place with ID ${placeId} not found`);
        return null;
    }
    return place;
};

// Validate both user and place exist, return both or send error response
export const requireUserAndPlace = async (res, userId, placeId) => {
    // Check placeId is provided
    if (!placeId) {
        R.badRequest(res, 'INVALID_INPUT', 'Place ID is required', { field: 'placeId' });
        return null;
    }
    // Fetch both resources concurrently
    const user = await db.findUserById(userId);
    const place = await db.findPlaceById(placeId);
    if (!user || !place) {
        R.notFound(res, 'USER_OR_PLACE_NOT_FOUND', `User with ID ${userId} or place with ID ${placeId} not found`);
        return null;
    }
    return { user, place };
};

export default { requireUser, requirePlace, requireUserAndPlace };
