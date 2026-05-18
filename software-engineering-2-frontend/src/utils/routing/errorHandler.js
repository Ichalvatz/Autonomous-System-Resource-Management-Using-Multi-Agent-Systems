/**
 * Route Error Handling
 * 
 * Provides user-friendly error messages for routing failures.
 * @module utils/routing/errorHandler
 */

const ERROR_MESSAGES = {
    WALKING: '🚫 This route is not possible by foot. The destination requires crossing water or other impassable terrain.',
    DRIVING: '🚫 This route is not possible by car. The destination requires crossing water - you may need a ferry or flight.',
    PUBLIC_TRANSPORT: '🚫 This route is not possible by road. The destination requires crossing water - consider a ferry or flight.',
    DEFAULT: '🚫 This route is not possible with the selected transport mode.'
};

/**
 * Gets user-friendly error message for route not found
 */
export const getRouteNotFoundMessage = (transportMode) => {
    return ERROR_MESSAGES[transportMode] || ERROR_MESSAGES.DEFAULT;
};

/**
 * Creates error response object
 */
export const createErrorResponse = (error, message, transportMode) => ({
    success: false,
    error,
    message,
    transportMode
});

/**
 * Creates routing failure response
 */
export const createRoutingFailureResponse = (transportMode) => {
    return createErrorResponse(
        'ROUTING_FAILED',
        'Could not fetch route. Showing straight line.',
        transportMode
    );
};
