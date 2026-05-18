/**
 * Route Validation
 * 
 * Validates OSRM API responses and route data.
 * @module utils/routing/routeValidator
 */

import { getRouteNotFoundMessage } from './errorHandler';

/**
 * Validates OSRM response code
 */
export const isValidOsrmCode = (code) => {
    return code === 'Ok';
};

/**
 * Validates route availability
 */
export const hasValidRoutes = (routes) => {
    return routes && routes.length > 0;
};

/**
 * Validates OSRM API response
 * Throws error if response is invalid
 */
export const validateOsrmResponse = (data, transportMode) => {
    if (!isValidOsrmCode(data.code)) {
        throw new Error(getRouteNotFoundMessage(transportMode));
    }
    
    if (!hasValidRoutes(data.routes)) {
        throw new Error(getRouteNotFoundMessage(transportMode));
    }
};

/**
 * Extracts first route from OSRM response
 */
export const extractRoute = (data) => {
    return data.routes[0];
};
