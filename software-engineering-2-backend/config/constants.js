/**
 * Application Constants - Central configuration values and enumerations
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const config = require('./constants.json');

export const {
    API_VERSION, JWT_EXPIRES_IN, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    MIN_PASSWORD_LENGTH, MIN_RATING, MAX_RATING, USER_ROLES,
    PLACE_CATEGORIES, REPORT_STATUS, TRANSPORTATION_MODES,
    DISTANCE_UNITS, DEFAULT_LOCATION, LANGUAGES,
    HTTP_STATUS, ERROR_CODES, SUCCESS_MESSAGES
} = config;

export default config;
