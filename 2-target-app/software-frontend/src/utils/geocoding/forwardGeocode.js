/**
 * Forward Geocoding Utilities
 * 
 * Convert place names to coordinates.
 */

import {
    forwardGeocodeCache,
    waitForRateLimit,
    extractDisplayName
} from './cache';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'myWorld-Travel-App/1.0'
};

/**
 * Validate query string
 * @param {string} query - Query to validate
 * @returns {boolean} True if valid
 */
const isValidQuery = (query) => {
    return query && query.trim().length >= 2;
};

/**
 * Build Nominatim search URL
 * @param {string} query - Search query
 * @returns {string} Complete URL
 */
const buildSearchUrl = (query) => {
    return `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
};

/**
 * Parse geocode response into result object
 * @param {Array} data - Nominatim response data
 * @returns {Object|null} Parsed result or null
 */
const parseGeocodeResult = (data) => {
    if (!data || data.length === 0) {
        return null;
    }

    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: extractDisplayName(data[0]) || data[0].display_name
    };
};

/**
 * Forward geocode a place name to coordinates
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * 
 * @param {string} query - Place name or address to search
 * @returns {Promise<{lat: number, lng: number, displayName: string} | null>} Coordinates or null if not found
 */
export const forwardGeocode = async (query) => {
    if (!isValidQuery(query)) {
        return null;
    }

    const cacheKey = query.trim().toLowerCase();

    if (forwardGeocodeCache.has(cacheKey)) {
        return forwardGeocodeCache.get(cacheKey);
    }

    try {
        await waitForRateLimit();

        const response = await fetch(buildSearchUrl(query), { headers: DEFAULT_HEADERS });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const result = parseGeocodeResult(data);

        forwardGeocodeCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.warn('Forward geocoding failed:', error.message);
        return null;
    }
};
