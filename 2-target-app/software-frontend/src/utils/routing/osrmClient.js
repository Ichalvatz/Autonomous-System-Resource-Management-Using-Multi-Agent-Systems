/**
 * OSRM API Client
 * 
 * Handles communication with OSRM routing service.
 * @module utils/routing/osrmClient
 */

const OSRM_BASE_URL = 'https://router.project-osrm.org';

const OSRM_PROFILES = {
    'WALKING': 'foot',
    'DRIVING': 'car',
    'PUBLIC_TRANSPORT': 'car',
};

/**
 * Constructs the OSRM API URL for route fetching
 */
export const buildOsrmUrl = (profile, startCoords, endCoords) => {
    const coordinates = `${startCoords};${endCoords}`;
    return `${OSRM_BASE_URL}/route/v1/${profile}/${coordinates}?overview=full&geometries=polyline`;
};

/**
 * Gets OSRM profile for transport mode
 */
export const getOsrmProfile = (transportMode) => {
    return OSRM_PROFILES[transportMode] || 'car';
};

/**
 * Fetches route data from OSRM API
 */
export const fetchOsrmData = async (url) => {
    const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`OSRM request failed: HTTP ${response.status}`);
    }

    return await response.json();
};

/**
 * Formats coordinates for OSRM API
 */
export const formatCoordinatesForOsrm = (lat, lng) => {
    return `${lng},${lat}`;
};
