/**
 * @fileoverview Unit Tests for Favourite Service
 * @module tests/unit/favouriteService.test 
 * Tests favourite and disliked places management including:
 * - Adding and removing favourite places
 * - Adding and removing disliked places
 * - Retrieving user's favourite and disliked places
 * 
 * Uses in-memory database for isolated testing.
 */

import * as favouriteService from '../../services/favouriteService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Test suite for favourite and disliked places service.
 * Tests add, get, and remove operations for both favourites and dislikes.
 */
describe('Favourite Service', () => {
  let testUserId;
  let testPlaceId;

  // Create test user and place before each test
  beforeEach(async () => {
    // Create test user and place
    const user = await db.createUser({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword123'
    });
    testUserId = user.userId;

    const place = await db.createPlace({
      name: 'Test Favourite Place',
      coordinates: { lat: 37.9838, lng: 23.7275 }
    });
    testPlaceId = place.placeId;
  });

  describe('addFavouritePlace', () => {
    it('should add place to favourites', async () => {
      const result = await favouriteService.addFavouritePlace(testUserId, testPlaceId);

      expect(result).toBeDefined();
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.addFavouritePlace('invalid', testPlaceId))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(favouriteService.addFavouritePlace(testUserId, 'invalid'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent place', async () => {
      await expect(favouriteService.addFavouritePlace(testUserId, '67890abcdef1234567890123'))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('getFavouritePlaces', () => {
    it('should get user favourite places', async () => {
      await favouriteService.addFavouritePlace(testUserId, testPlaceId);

      const result = await favouriteService.getFavouritePlaces(testUserId);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.getFavouritePlaces('invalid'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should return empty array for user with no favourites', async () => {
      const result = await favouriteService.getFavouritePlaces(testUserId);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('removeFavouritePlace', () => {
    it('should remove place from favourites', async () => {
      await favouriteService.addFavouritePlace(testUserId, testPlaceId);

      const result = await favouriteService.removeFavouritePlace(testUserId, testPlaceId);

      expect(result).toBeDefined();
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.removeFavouritePlace('invalid', testPlaceId))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(favouriteService.removeFavouritePlace(testUserId, 'invalid'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('addDislikedPlace', () => {
    it('should add place to disliked', async () => {
      const result = await favouriteService.addDislikedPlace(testUserId, testPlaceId);

      expect(result).toBeDefined();
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.addDislikedPlace('invalid', testPlaceId))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(favouriteService.addDislikedPlace(testUserId, 'invalid'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent place', async () => {
      await expect(favouriteService.addDislikedPlace(testUserId, '67890abcdef1234567890123'))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('getDislikedPlaces', () => {
    it('should get user disliked places', async () => {
      const result = await favouriteService.getDislikedPlaces(testUserId);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.getDislikedPlaces('invalid'))
        .rejects
        .toThrow(ValidationError);
    });
  });

  describe('removeDislikedPlace', () => {
    it('should remove place from disliked', async () => {
      await favouriteService.addDislikedPlace(testUserId, testPlaceId);

      const result = await favouriteService.removeDislikedPlace(testUserId, testPlaceId);

      expect(result).toBeDefined();
    });

    it('should throw ValidationError for invalid user ID', async () => {
      await expect(favouriteService.removeDislikedPlace('invalid', testPlaceId))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(favouriteService.removeDislikedPlace(testUserId, 'invalid'))
        .rejects
        .toThrow(ValidationError);
    });
  });
});
