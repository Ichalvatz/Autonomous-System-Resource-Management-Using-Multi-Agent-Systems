/**
 * Preference Create Controller
 * Handles creation of user preference profiles
 * @module controllers/preferenceCreate
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requireUser } from '../utils/controllerValidators.js';

export const VALID_CATEGORIES = ['MUSEUM', 'BEACH', 'PARK', 'RESTAURANT', 'NIGHTLIFE', 'SHOPPING', 'SPORTS', 'CULTURE'];

// Normalize profile objects to consistent format
export const normalizeProfiles = (profiles) => (profiles || []).map(p => ({
    profileId: p.profileId || p.id,
    name: p.name || p.profileName,
    categories: Array.isArray(p.categories) ? p.categories : [],
    priceRange: p.priceRange,
    userId: p.userId
}));

// Extract categories from request body (supports multiple field names)
const getCategories = (body) => Array.isArray(body.categories) ? body.categories : body.selectedPreferences;
const getFieldName = (body) => Array.isArray(body.categories) ? 'categories' : 'selectedPreferences';

// Validate category array contains valid values
const validateCategories = (res, cats, field) => {
    if (!Array.isArray(cats) || cats.length === 0) {
        R.badRequest(res, 'INVALID_PROFILE_DATA', 'No preferences selected', { field });
        return false;
    }
    const invalid = cats.filter(c => !VALID_CATEGORIES.includes(c));
    if (invalid.length > 0) {
        R.badRequest(res, 'INVALID_PROFILE_DATA', 'Invalid categories', { field, invalidValues: invalid });
        return false;
    }
    return true;
};

// Generate unique profile name by appending counter if name exists
const generateUniqueName = (baseName, existingProfiles) => {
    const names = new Set((existingProfiles || []).map(p => (p.name || '').trim()));
    if (!names.has(baseName)) return baseName;
    // Add incrementing suffix until name is unique
    let c = 2;
    while (names.has(`${baseName} (${c})`)) c++;
    return `${baseName} (${c})`;
};

// Create new preference profile for user
const createPreferenceProfile = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!await requireUser(res, userId)) return;

        // Validate category selection
        const cats = getCategories(req.body);
        const field = getFieldName(req.body);
        if (!validateCategories(res, cats, field)) return;

        // Validate profile name if provided
        if (req.body.profileName && typeof req.body.profileName !== 'string') {
            return R.badRequest(res, 'INVALID_PROFILE_DATA', 'Name must be a string', { field: 'profileName' });
        }

        // Generate unique profile name
        const existing = await db.getPreferenceProfiles(userId);
        const baseName = (req.body.profileName || '').trim() || `Profile ${(existing?.length || 0) + 1}`;
        const name = generateUniqueName(baseName, existing);

        // Create profile and return all profiles
        await db.addPreferenceProfile({ userId, name, categories: cats });
        const all = await db.getPreferenceProfiles(userId);

        return R.success(res, { profiles: normalizeProfiles(all), links: buildHateoasLinks.preferenceProfilesCollection(userId) }, 'Profile created', 201);
    } catch (e) { next(e); }
};

export default { createPreferenceProfile };
