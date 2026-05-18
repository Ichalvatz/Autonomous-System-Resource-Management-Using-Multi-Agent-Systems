/**
 * Navigation Controller
 * Handles route calculation between locations
 * @module controllers/navigationController
 */

import buildHateoasLinks from '../utils/hateoasBuilder.js';
import { calculateDistance } from '../utils/geoUtils.js';
import R from '../utils/responseBuilder.js';

/** Supported transportation modes with their respective speeds in km/h */
const TRANSPORTATION = {
  WALKING: { speed: 5 },
  DRIVING: { speed: 50 },
  PUBLIC_TRANSPORT: { speed: 30 }
};

/** Extract valid transportation modes */
const VALID_MODES = Object.keys(TRANSPORTATION);

/**
 * Parse and validate coordinates
 * @param {string} latitude - Latitude as string
 * @param {string} longitude - Longitude as string
 * @returns {Object|null} Parsed coordinates or null if invalid
 */
const parseCoordinates = (latitude, longitude) => {
  if (!latitude || !longitude) {
    return null;
  }

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon)) {
    return null;
  }

  return { lat, lon };
};

/**
 * Validate transportation mode
 * @param {string} mode - Transportation mode to validate
 * @returns {boolean} True if mode is valid
 */
const isValidMode = (mode) => VALID_MODES.includes(mode);

/**
 * Calculate estimated travel time in minutes
 * @param {number} distance - Distance in kilometers
 * @param {string} mode - Transportation mode
 * @returns {number} Estimated time in minutes (rounded up)
 */
const calculateTravelTime = (distance, mode) => {
  const speed = TRANSPORTATION[mode].speed;
  return Math.ceil((distance / speed) * 60);
};

/**
 * Build route response object
 * @param {Object} start - Start coordinates {lat, lon}
 * @param {Object} end - End coordinates {lat, lon}
 * @param {string} mode - Transportation mode
 * @param {number} distance - Distance in kilometers
 * @returns {Object} Route information object
 */
const buildRouteResponse = (start, end, mode, distance) => ({
  startPoint: {
    latitude: start.lat,
    longitude: start.lon
  },
  endPoint: {
    latitude: end.lat,
    longitude: end.lon
  },
  transportationMode: mode,
  estimatedTime: calculateTravelTime(distance, mode),
  distance
});

/**
 * GET /navigation - Calculate route between two points
 * Validates input parameters, calculates distance and travel time
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getNavigation = async (req, res, next) => {
  try {
    const {
      userLatitude,
      userLongitude,
      placeLatitude,
      placeLongitude,
      transportationMode
    } = req.query;

    // Parse and validate user coordinates
    const userCoords = parseCoordinates(userLatitude, userLongitude);
    if (!userCoords) {
      return R.badRequest(res, 'INVALID_INPUT', 'Valid user location coordinates required');
    }

    // Parse and validate place coordinates
    const placeCoords = parseCoordinates(placeLatitude, placeLongitude);
    if (!placeCoords) {
      return R.badRequest(res, 'INVALID_INPUT', 'Valid place location coordinates required');
    }

    // Validate transportation mode (default to WALKING)
    const mode = transportationMode || 'WALKING';
    if (!isValidMode(mode)) {
      return R.badRequest(
        res,
        'INVALID_INPUT',
        `Invalid transportation mode. Must be one of: ${VALID_MODES.join(', ')}`
      );
    }

    // Calculate distance between coordinates
    const distance = calculateDistance(
      { latitude: userCoords.lat, longitude: userCoords.lon },
      { latitude: placeCoords.lat, longitude: placeCoords.lon }
    );

    // Build complete route response
    const route = buildRouteResponse(userCoords, placeCoords, mode, distance);

    // Return success response with route data and HATEOAS links
    return R.success(
      res,
      { route, links: buildHateoasLinks.navigation() },
      'Route calculated successfully'
    );
  } catch (error) {
    next(error);
  }
};

export default { getNavigation };
