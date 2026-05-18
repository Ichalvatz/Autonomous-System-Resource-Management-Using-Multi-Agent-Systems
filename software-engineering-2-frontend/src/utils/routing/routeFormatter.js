/**
 * Route Response Formatting
 * 
 * Formats OSRM route data into application-specific format.
 * @module utils/routing/routeFormatter
 */

/**
 * Converts meters to kilometers
 */
const toKilometers = (meters) => meters / 1000;

/**
 * Converts seconds to minutes
 */
const toMinutes = (seconds) => seconds / 60;

/**
 * Creates success response object
 */
export const createSuccessResponse = (geometry, route, transportMode) => ({
    success: true,
    geometry,
    distance: toKilometers(route.distance),
    duration: toMinutes(route.duration),
    transportMode,
    requiresFerry: false
});

/**
 * Creates ferry warning response object
 */
export const createFerryResponse = (geometry, route, transportMode, seaCrossing) => ({
    success: true,
    geometry,
    distance: toKilometers(route.distance),
    duration: toMinutes(route.duration),
    transportMode,
    requiresFerry: true,
    ferryWarning: seaCrossing.message,
    islandName: seaCrossing.islandName
});

/**
 * Formats route response based on ferry requirements
 */
export const formatRouteResponse = (route, geometry, transportMode, seaCrossing) => {
    if (seaCrossing.requiresFerry) {
        return createFerryResponse(geometry, route, transportMode, seaCrossing);
    }
    return createSuccessResponse(geometry, route, transportMode);
};
