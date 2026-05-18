/**
 * Application Constants
 * Data loaded from JSON for better maintainability
 */

import data from './constants.json';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/myWorld/api';

export const {
  PLACE_CATEGORIES,
  PLACE_CATEGORIES_EN,
  PREFERENCE_TYPES,
  PRICE_RANGES,
  RATING_OPTIONS,
  NAVIGATION_MODES,
  TOAST_DURATION,
  ITEMS_PER_PAGE,
  DEFAULT_PAGE,
  STORAGE_KEYS,
  VALIDATION_RULES,
  MAP_CONFIG,
  HTTP_STATUS
} = data;
