/**
 * Geo Utilities
 * Common geographic calculation functions
 */

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
export const toRad = (degrees) => {
    return degrees * (Math.PI / 180);
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} from - Starting point coordinates
 * @param {number} from.latitude - Latitude of first point
 * @param {number} from.longitude - Longitude of first point
 * @param {Object} to - Ending point coordinates
 * @param {number} to.latitude - Latitude of second point
 * @param {number} to.longitude - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (from, to) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(to.latitude - from.latitude);
    const dLon = toRad(to.longitude - from.longitude);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
};
