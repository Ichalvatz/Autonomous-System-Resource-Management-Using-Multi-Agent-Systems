/**
 * Geocoding Utilities
 * 
 * Provides geocoding using OpenStreetMap Nominatim API.
 * Features:
 * - In-memory caching to avoid repeated API calls
 * - Rate limiting (1 request/second per Nominatim policy)
 * - Graceful fallback to formatted coordinates on failure
 * 
 * Functions are split into category files for maintainability.
 */

// Cache and utility exports
export { formatCoordinates, clearGeocodeCache } from './geocoding/cache';

// Reverse geocoding (coordinates -> location name)
export { reverseGeocode, batchReverseGeocode } from './geocoding/reverseGeocode';

// Forward geocoding (location name -> coordinates)
export { forwardGeocode } from './geocoding/forwardGeocode';

// Location search (autocomplete)
export { searchLocations } from './geocoding/searchLocations';
