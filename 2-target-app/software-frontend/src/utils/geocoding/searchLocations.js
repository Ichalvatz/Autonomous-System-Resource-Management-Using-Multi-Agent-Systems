/**
 * Location Search Utilities
 * 
 * Search for location suggestions (autocomplete).
 */

import { waitForRateLimit } from './cache';
import { getPlaceType, extractSearchDisplayName } from './placeTypes';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const GREECE_VIEWBOX = '19.3,34.8,29.7,41.8';
const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'myWorld-Travel-App/1.0'
};

/**
 * Build URL for Nominatim search
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {boolean} useGreece - Whether to bias towards Greece
 * @returns {string} Complete URL
 */
const buildSearchUrl = (query, limit, useGreece = true) => {
    const params = new URLSearchParams({
        format: 'json',
        q: query,
        limit: limit.toString(),
        addressdetails: '1'
    });

    if (useGreece) {
        params.set('viewbox', GREECE_VIEWBOX);
        params.set('bounded', '0');
        params.set('countrycodes', 'gr');
    }

    return `${NOMINATIM_BASE_URL}?${params.toString()}`;
};

/**
 * Generate unique coordinate key for deduplication
 * @param {Object} item - Nominatim result item
 * @returns {string} Coordinate key
 */
const getCoordKey = (item) => {
    return `${parseFloat(item.lat).toFixed(4)},${parseFloat(item.lon).toFixed(4)}`;
};

/**
 * Transform Nominatim item to result format
 * @param {Object} item - Nominatim result item
 * @returns {Object} Transformed result
 */
const transformResult = (item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    displayName: extractSearchDisplayName(item),
    type: getPlaceType(item),
    importance: item.importance || 0
});

/**
 * Process and deduplicate search results
 * @param {Array} data - Raw Nominatim results
 * @param {Set} seenCoords - Set of already seen coordinates
 * @returns {Array} Processed unique results
 */
const processResults = (data, seenCoords) => {
    const results = [];

    for (const item of data) {
        const coordKey = getCoordKey(item);
        if (!seenCoords.has(coordKey)) {
            seenCoords.add(coordKey);
            results.push(transformResult(item));
        }
    }

    return results;
};

/**
 * Fetch results from Nominatim API
 * @param {string} url - Request URL
 * @returns {Promise<Array>} Results array or empty on error
 */
const fetchNominatim = async (url) => {
    const response = await fetch(url, { headers: DEFAULT_HEADERS });
    return response.ok ? response.json() : [];
};

/**
 * Search for location suggestions (for autocomplete)
 * Supports fuzzy/partial matching and includes all types of places
 * Biased towards Greece for better local results
 * 
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array<{lat: number, lng: number, displayName: string, type: string}>>} Array of suggestions
 */
export const searchLocations = async (query, limit = 8) => {
    if (!query || query.trim().length < 2) {
        return [];
    }

    const trimmedQuery = query.trim();

    try {
        const results = [];
        const seenCoords = new Set();

        // Strategy 1: Direct search in Greece
        await waitForRateLimit();
        const url1 = buildSearchUrl(trimmedQuery, limit, true);
        const data1 = await fetchNominatim(url1);
        results.push(...processResults(data1, seenCoords));

        // Strategy 2: If few results, try with ", Greece" suffix
        if (results.length < limit / 2) {
            await waitForRateLimit();
            const url2 = buildSearchUrl(`${trimmedQuery}, Greece`, limit, false);
            const data2 = await fetchNominatim(url2);
            results.push(...processResults(data2, seenCoords));
        }

        // Sort by importance and limit results
        results.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        return results.slice(0, limit);
    } catch (error) {
        console.warn('Location search failed:', error.message);
        return [];
    }
};
