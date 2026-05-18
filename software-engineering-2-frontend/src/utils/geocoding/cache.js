/**
 * Geocoding Cache and Rate Limiting
 * 
 * Shared caching and rate limiting infrastructure for geocoding utilities.
 */

// In-memory cache for geocoded results (reverse geocoding)
export const geocodeCache = new Map();

// Cache for forward geocoding (place name -> coordinates)
export const forwardGeocodeCache = new Map();

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

/**
 * Format coordinates as a human-readable string
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Formatted coordinates
 */
export const formatCoordinates = (lat, lng) => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
};

/**
 * Generate cache key from coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {string} Cache key
 */
export const getCacheKey = (lat, lng) => {
    // Round to 4 decimal places for cache key (about 11m precision)
    return `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
};

/**
 * Wait for rate limiting
 * @returns {Promise<void>}
 */
export const waitForRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;

    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    lastRequestTime = Date.now();
};

/**
 * Clear the geocode cache (useful for testing)
 */
export const clearGeocodeCache = () => {
    geocodeCache.clear();
    forwardGeocodeCache.clear();
};

/**
 * Extract best display name from Nominatim response
 * @param {Object} data - Nominatim response data
 * @returns {string} Best display name
 */
export const extractDisplayName = (data) => {
    const address = data.address || {};

    // Priority order for display name
    const nameOptions = [
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.county,
        address.state,
    ].filter(Boolean);

    const country = address.country;

    if (nameOptions.length > 0) {
        return country ? `${nameOptions[0]}, ${country}` : nameOptions[0];
    }

    // Fallback to display_name or raw coordinates
    if (data.display_name) {
        // Take first two parts of display name
        const parts = data.display_name.split(',').slice(0, 2).map(s => s.trim());
        return parts.join(', ');
    }

    return null;
};
