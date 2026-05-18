/**
 * @fileoverview Unit Tests for Place Service
 * @module tests/unit/placeService.test 
 * Tests place-related business logic including:
 * - Place creation and retrieval
 * - Place search functionality
 * - Place updates and deletion
 * 
 * Uses in-memory database for isolated testing.
 */

import * as placeService from '../../services/placeService.js';
import db from '../../config/db.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

/**
 * Test suite for place service business logic.
 * Tests CRUD operations and search functionality for places.
 */
describe('Place Service', () => {
  // Tests for place creation with full and minimal data
  describe('createPlace', () => {
    it('should create a new place successfully', async () => {
      const placeData = {
        name: 'Acropolis Museum',
        address: 'Dionysiou Areopagitou 15, Athens',
        coordinates: { lat: 37.9684, lng: 23.7285 },
        category: 'Museum',
        description: 'Modern museum for Acropolis artifacts',
        rating: 4.7
      };

      const result = await placeService.createPlace(placeData);

      expect(result).toBeDefined();
      expect(result.name).toBe(placeData.name);
      expect(result.category).toBe(placeData.category);
      expect(result.rating).toBe(placeData.rating);
    });

    it('should create place with minimal data', async () => {
      const minimalPlace = {
        name: 'Test Location',
        coordinates: { lat: 40.0, lng: 22.0 }
      };

      const result = await placeService.createPlace(minimalPlace);

      expect(result).toBeDefined();
      expect(result.name).toBe(minimalPlace.name);
    });
  });

  describe('getPlaceById', () => {
    it('should get place by valid ID', async () => {
      // Create a place first
      const newPlace = await db.createPlace({
        name: 'National Garden',
        coordinates: { lat: 37.9745, lng: 23.7365 }
      });

      const result = await placeService.getPlaceById(newPlace.placeId);

      expect(result).toBeDefined();
      expect(result.placeId).toBe(newPlace.placeId);
      expect(result.name).toBe('National Garden');
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(placeService.getPlaceById('invalid-id'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent place ID', async () => {
      await expect(placeService.getPlaceById('67890abcdef1234567890123'))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('searchPlaces', () => {
    it('should search places with query parameters', async () => {
      await db.createPlace({ name: 'Museum A', category: 'Museum' });
      await db.createPlace({ name: 'Museum B', category: 'Museum' });

      const result = await placeService.searchPlaces(['Museum']);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when no places match', async () => {
      const result = await placeService.searchPlaces(['NonExistent']);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getAllPlaces', () => {
    it('should get all places', async () => {
      await db.createPlace({ name: 'Place 1', coordinates: { lat: 38.0, lng: 23.0 } });
      await db.createPlace({ name: 'Place 2', coordinates: { lat: 38.1, lng: 23.1 } });

      const result = await placeService.getAllPlaces();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('updatePlace', () => {
    it('should update place successfully', async () => {
      const place = await db.createPlace({
        name: 'Original Name',
        coordinates: { lat: 37.0, lng: 23.0 }
      });

      const updateData = { name: 'Updated Name', rating: 4.5 };
      const result = await placeService.updatePlace(place.placeId, updateData);

      expect(result.name).toBe('Updated Name');
      expect(result.rating).toBe(4.5);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(placeService.updatePlace('invalid', { name: 'Test' }))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent place', async () => {
      await expect(placeService.updatePlace('67890abcdef1234567890123', { name: 'Test' }))
        .rejects
        .toThrow(NotFoundError);
    });
  });

  describe('deletePlace', () => {
    it('should delete place successfully', async () => {
      const place = await db.createPlace({
        name: 'To Be Deleted',
        coordinates: { lat: 37.5, lng: 23.5 }
      });

      const result = await placeService.deletePlace(place.placeId);

      expect(result).toBeDefined();

      // Verify it's deleted
      await expect(placeService.getPlaceById(place.placeId))
        .rejects
        .toThrow(NotFoundError);
    });

    it('should throw ValidationError for invalid place ID', async () => {
      await expect(placeService.deletePlace('invalid'))
        .rejects
        .toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent place', async () => {
      await expect(placeService.deletePlace('67890abcdef1234567890123'))
        .rejects
        .toThrow(NotFoundError);
    });
  });
});
