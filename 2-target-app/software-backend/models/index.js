/**
 * Models Index
 * Central export point for all Mongoose models
 */

// Core entities
import { User, Place, Counter } from './coreModels.js';
// User interactions
import { Review, Report, PreferenceProfile, Settings } from './userInteractionModels.js';
// Place interactions
import { FavouritePlace, DislikedPlace } from './placeInteractionModels.js';

export default {
  User,
  Place,
  PreferenceProfile,
  Review,
  Report,
  FavouritePlace,
  DislikedPlace,
  Settings,
  Counter
};
