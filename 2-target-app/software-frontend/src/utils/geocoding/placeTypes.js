/**
 * Place Type Mapping
 * 
 * Maps Nominatim class/type to user-friendly place types with icons.
 */

import { PLACE_TYPE_MAP, CLASS_FALLBACK_MAP, DEFAULT_PLACE_TYPE } from './placeTypeMap';

/**
 * Get a user-friendly place type from Nominatim class/type
 * @param {Object} item - Nominatim result item
 * @returns {string} Human-readable place type
 */
export const getPlaceType = (item) => {
    const type = item.type || '';
    const category = item.class || '';

    return PLACE_TYPE_MAP[type] || PLACE_TYPE_MAP[category] || CLASS_FALLBACK_MAP[category] || DEFAULT_PLACE_TYPE;
};

/**
 * Get primary location from address
 * @param {Object} address - Nominatim address object
 * @returns {string|null} Primary location name
 */
const getPrimaryLocation = (address) => {
    return address.city || address.town || address.village || address.municipality || null;
};

/**
 * Get region from address
 * @param {Object} address - Nominatim address object
 * @returns {string|null} Region or state name
 */
const getRegion = (address) => {
    return address.state || address.region || null;
};

/**
 * Build location context array from address
 * @param {Object} address - Nominatim address object
 * @returns {Array<string>} Location context parts
 */
const buildLocationContext = (address) => {
    const context = [];

    const primary = getPrimaryLocation(address);
    if (primary) context.push(primary);

    const region = getRegion(address);
    if (region) context.push(region);

    return context;
};

/**
 * Format display name with context
 * @param {string} name - Place name
 * @param {Array<string>} context - Location context parts
 * @returns {string} Formatted display name
 */
const formatWithContext = (name, context) => {
    if (name && !context.includes(name)) {
        return context.length > 0 ? `${name}, ${context.join(', ')}` : name;
    }
    return context.length > 0 ? context.join(', ') : null;
};

/**
 * Truncate display name to first 3 parts
 * @param {string} displayName - Full display name
 * @returns {string} Truncated display name
 */
const truncateDisplayName = (displayName) => {
    const parts = displayName.split(',').slice(0, 3).map(s => s.trim());
    return parts.join(', ');
};

/**
 * Extract a better display name for search results
 * @param {Object} item - Nominatim result item
 * @returns {string} Formatted display name
 */
export const extractSearchDisplayName = (item) => {
    const address = item.address || {};
    const name = item.name || '';
    const context = buildLocationContext(address);

    const formatted = formatWithContext(name, context);
    if (formatted) return formatted;

    if (item.display_name) {
        return truncateDisplayName(item.display_name);
    }

    return 'Unknown location';
};
