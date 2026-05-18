/**
 * @fileoverview Favourite Service
 * @description Business logic for favourite and disliked places management.
 * Handles validation, error handling, and database interactions for user place preferences.
 * 
 * @module services/favouriteService
 * @requires ../config/db
 * @requires ../utils/errors
 * @requires ../utils/validators
 */

import db from '../config/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { isValidUserId, isValidPlaceId } from '../utils/validators.js';

/**
 * Gets all favourite places for a user.
 * @param {number} userId - The user's ID
 * @returns {Promise<Array>} Array of favourite places
 * @throws {ValidationError} If userId is invalid
 */
export const getFavouritePlaces = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  return await db.getFavouritePlaces(userId);
};

export const addFavouritePlace = async (userId, placeId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidPlaceId(placeId)) {
    throw new ValidationError('Invalid place ID');
  }

  // Check if place exists
  const place = await db.findPlaceById(placeId);
  if (!place) {
    throw new NotFoundError('Place', placeId);
  }

  return await db.addFavouritePlace(userId, placeId);
};

export const removeFavouritePlace = async (userId, placeId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidPlaceId(placeId)) {
    throw new ValidationError('Invalid place ID');
  }

  return await db.removeFavouritePlace(userId, placeId);
};

export const getDislikedPlaces = async (userId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  return await db.getDislikedPlaces(userId);
};

export const addDislikedPlace = async (userId, placeId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidPlaceId(placeId)) {
    throw new ValidationError('Invalid place ID');
  }

  // Check if place exists
  const place = await db.findPlaceById(placeId);
  if (!place) {
    throw new NotFoundError('Place', placeId);
  }

  return await db.addDislikedPlace(userId, placeId);
};

export const removeDislikedPlace = async (userId, placeId) => {
  if (!isValidUserId(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!isValidPlaceId(placeId)) {
    throw new ValidationError('Invalid place ID');
  }

  return await db.removeDislikedPlace(userId, placeId);
};

export default {
  getFavouritePlaces,
  addFavouritePlace,
  removeFavouritePlace,
  getDislikedPlaces,
  addDislikedPlace,
  removeDislikedPlace
};
