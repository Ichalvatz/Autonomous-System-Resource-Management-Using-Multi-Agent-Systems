/**
 * Reverse Geocoding Utilities
 * 
 * Convert coordinates to human-readable location names.
 */

import {
    geocodeCache,
    getCacheKey,
    waitForRateLimit,
    formatCoordinates,
    extractDisplayName
} from './cache';

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'myWorld-Travel-App/1.0'
};

/**
 * Build reverse geocode URL
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Complete URL
 */
const buildReverseUrl = (lat, lng) => {
    return `${NOMINATIM_REVERSE_URL}?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
};

/**
 * Create result object from geocode data
 * @param {Object} data - Nominatim response
 * @param {number} lat - Original latitude
 * @param {number} lng - Original longitude
 * @returns {Object} Result with name and isCoordinates flag
 */
const createResult = (data, lat, lng) => {
    const displayName = extractDisplayName(data);
    return {
        name: displayName || formatCoordinates(lat, lng),
        isCoordinates: !displayName
    };
};

/**
 * Create fallback result with formatted coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Fallback result
 */
const createFallback = (lat, lng) => ({
    name: formatCoordinates(lat, lng),
    isCoordinates: true
});

/**
 * Reverse geocode coordinates to a human-readable location name
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{name: string, isCoordinates: boolean}>} Location info
 */
export const reverseGeocode = async (lat, lng) => {
    const cacheKey = getCacheKey(lat, lng);

    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    try {
        await waitForRateLimit();

        const response = await fetch(buildReverseUrl(lat, lng), { headers: DEFAULT_HEADERS });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const result = createResult(data, lat, lng);
        geocodeCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.warn('Reverse geocoding failed:', error.message);
        const fallback = createFallback(lat, lng);
        geocodeCache.set(cacheKey, fallback);
        return fallback;
    }
};

/**
 * Batch reverse geocode multiple coordinates
 * Respects rate limiting between requests
 * 
 * @param {Array<{lat: number, lng: number}>} coordinates - Array of coordinate objects
 * @returns {Promise<Array<{name: string, isCoordinates: boolean}>>} Array of location info
 */
export const batchReverseGeocode = async (coordinates) => {
    const results = [];

    for (const { lat, lng } of coordinates) {
        const result = await reverseGeocode(lat, lng);
        results.push(result);
    }

    return results;
};
