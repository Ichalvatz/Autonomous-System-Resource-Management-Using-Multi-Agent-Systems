/**
 * @fileoverview Place Service
 * @description Business logic for place management including CRUD operations.
 * Handles validation, error handling, and database interactions for place management.
 * 
 * @module services/placeService
 * @requires ../config/db
 * @requires ../utils/errors
 * @requires ../utils/validators
 */

import db from '../config/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { isValidPlaceId } from '../utils/validators.js';

// --- Helper Functions (Private) ---

/**
 * Validates place ID and retrieves the place, or throws appropriate error.
 * @param {string|number} placeId - The place's ID
 * @returns {Promise<Object>} Place object
 * @throws {ValidationError} If placeId is invalid
 * @throws {NotFoundError} If place not found
 */
const _findPlaceOrThrow = async (placeId) => {
  if (!isValidPlaceId(placeId)) {
    throw new ValidationError('Invalid place ID');
  }
  const place = await db.findPlaceById(placeId);
  if (!place) {
    throw new NotFoundError('Place', placeId);
  }
  return place;
};

// --- Service Methods ---

export const getPlaceById = async (placeId) => {
  return await _findPlaceOrThrow(placeId);
};

export const searchPlaces = async (searchParams) => {
  return await db.searchPlaces(searchParams);
};

export const getAllPlaces = async () => {
  return await db.getAllPlaces();
};

export const createPlace = async (placeData) => {
  return await db.createPlace(placeData);
};

export const updatePlace = async (placeId, updateData) => {
  await _findPlaceOrThrow(placeId);
  return await db.updatePlace(placeId, updateData);
};

export const deletePlace = async (placeId) => {
  await _findPlaceOrThrow(placeId);
  return await db.deletePlace(placeId);
};

export default {
  getPlaceById,
  searchPlaces,
  getAllPlaces,
  createPlace,
  updatePlace,
  deletePlace
};

