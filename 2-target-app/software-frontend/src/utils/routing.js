/**
 * Routing Utilities
 * 
 * Provides route fetching using OSRM (Open Source Routing Machine).
 * Features:
 * - Fetches actual route geometry (polyline) for display on maps
 * - Supports different transport modes (walking, driving)
 * - Detects routes that require ferry/sea crossing
 * - Uses free OSRM demo server
 */

import { detectSeaCrossing } from './routing/greekIslands';
import { decodePolyline } from './routing/polyline';
import { 
    buildOsrmUrl, 
    getOsrmProfile, 
    fetchOsrmData, 
    formatCoordinatesForOsrm 
} from './routing/osrmClient';
import { validateOsrmResponse, extractRoute } from './routing/routeValidator';
import { formatRouteResponse } from './routing/routeFormatter';
import { createRoutingFailureResponse } from './routing/errorHandler';

/**
 * Fetch route from OSRM
 * 
 * @param {Object} params - Route parameters
 * @param {number} params.startLat - Start latitude
 * @param {number} params.startLng - Start longitude
 * @param {number} params.endLat - End latitude
 * @param {number} params.endLng - End longitude
 * @param {string} params.transportMode - Transport mode (WALKING, DRIVING, PUBLIC_TRANSPORT)
 * @returns {Promise<Object>} Route data or error
 */
export const fetchRoute = async ({
    startLat,
    startLng,
    endLat,
    endLng,
    transportMode = 'DRIVING'
}) => {
    const profile = getOsrmProfile(transportMode);
    const seaCrossing = detectSeaCrossing(startLat, startLng, endLat, endLng);
    const startCoords = formatCoordinatesForOsrm(startLat, startLng);
    const endCoords = formatCoordinatesForOsrm(endLat, endLng);
    const url = buildOsrmUrl(profile, startCoords, endCoords);

    try {
        const data = await fetchOsrmData(url);
        validateOsrmResponse(data, transportMode);
        
        const route = extractRoute(data);
        const geometry = decodePolyline(route.geometry, 5);

        return formatRouteResponse(route, geometry, transportMode, seaCrossing);
    } catch (error) {
        console.warn('OSRM routing failed:', error.message);
        return createRoutingFailureResponse(transportMode);
    }
};

/**
 * Check if a route is possible between two points
 * Quick check without full route calculation
 * 
 * @param {Object} params - Same as fetchRoute
 * @returns {Promise<boolean>} True if route is possible
 */
export const isRoutePossible = async (params) => {
    const result = await fetchRoute(params);
    return result.success;
};
