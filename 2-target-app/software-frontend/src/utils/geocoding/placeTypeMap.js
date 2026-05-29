/**
 * Place Type Mapping Data
 * 
 * Maps Nominatim class/type to user-friendly place types with icons.
 * Data loaded from JSON for better maintainability.
 */

import data from './placeTypeMap.json';

export const { PLACE_TYPE_MAP, CLASS_FALLBACK_MAP, DEFAULT_PLACE_TYPE } = data;
