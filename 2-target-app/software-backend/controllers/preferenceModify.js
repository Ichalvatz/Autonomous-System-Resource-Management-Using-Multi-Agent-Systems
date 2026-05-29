/**
 * Preference Modify Controller
 * Handles update and delete of preference profiles
 * @module controllers/preferenceModify
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requireUser } from '../utils/controllerValidators.js';
import { VALID_CATEGORIES } from './preferenceCreate.js';

const normalizeProfiles = (profiles) => (profiles || []).map(p => ({ ...p, categories: Array.isArray(p.categories) ? p.categories : [] }));

// =============================================================================
// Helper Functions - Extract validation and payload normalization logic
// =============================================================================

/**
 * Extract category data from request body
 * @param {Object} body - Request body
 * @returns {Object|null} Object with categories and fieldName, or null if no categories present
 */
const extractCategories = (body) => {
    if (Array.isArray(body.categories)) return { categories: body.categories, fieldName: 'categories' };
    if (Array.isArray(body.selectedPreferences)) return { categories: body.selectedPreferences, fieldName: 'selectedPreferences' };
    return null;
};

/**
 * Validate category input
 * @param {Object} res - Express response object
 * @param {Object|null} categoryData - Extracted category data
 * @returns {boolean} True if valid or not present, false if invalid (response sent)
 */
const validateCategoryInput = (res, categoryData) => {
    if (!categoryData) return true; // No categories to validate

    const { categories, fieldName } = categoryData;
    
    if (categories.length === 0) {
        R.badRequest(res, 'INVALID_PROFILE_DATA', 'No preferences selected', 
            { field: fieldName, value: [], reason: 'At least one preference category must be selected' });
        return false;
    }
    
    const invalidCategories = categories.filter(pref => !VALID_CATEGORIES.includes(pref));
    if (invalidCategories.length > 0) {
        R.badRequest(res, 'INVALID_PROFILE_DATA', 'Invalid preference categories', 
            { field: 'categories', invalidValues: invalidCategories });
        return false;
    }
    
    return true;
};

/**
 * Normalize the update payload
 * @param {Object} body - Original request body
 * @param {Array} categories - Validated categories (optional)
 * @returns {Object} Normalized payload
 */
const normalizeUpdatePayload = (body, categories) => {
    const payload = { ...body };
    if (categories) payload.categories = categories;
    
    // Normalize profile name field
    if ('profileName' in payload) { 
        payload.name = payload.profileName; 
        delete payload.profileName; 
    }
    
    // Remove legacy field
    delete payload.selectedPreferences;
    
    return payload;
};

// =============================================================================
// Controllers
// =============================================================================

const updatePreferenceProfile = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const profileId = parseInt(req.params.profileId);

        const user = await requireUser(res, userId);
        if (!user) return;

        // Extract and validate categories
        const categoryData = extractCategories(req.body);
        if (!validateCategoryInput(res, categoryData)) return;

        // Prepare update payload
        const updatePayload = normalizeUpdatePayload(req.body, categoryData?.categories);

        const updatedProfile = await db.updatePreferenceProfile(userId, profileId, updatePayload);
        if (!updatedProfile) {
            return R.notFound(res, 'PROFILE_NOT_FOUND', `Profile with ID ${profileId} not found for user ${userId}`);
        }

        const allProfiles = await db.getPreferenceProfiles(userId);
        return R.success(res, { 
            profiles: normalizeProfiles(allProfiles), 
            links: buildHateoasLinks.preferenceProfilesCollection(userId) 
        }, 'Preference profile updated successfully');
    } catch (error) { next(error); }
};

const deletePreferenceProfile = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const profileId = parseInt(req.params.profileId);

        const user = await requireUser(res, userId);
        if (!user) return;

        const deleted = await db.deletePreferenceProfile(userId, profileId);
        if (!deleted) {
            return R.notFound(res, 'PROFILE_NOT_FOUND', `Profile with ID ${profileId} not found for user ${userId}`);
        }

        return R.noContent(res);
    } catch (error) { next(error); }
};

const activatePreferenceProfile = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const profileId = parseInt(req.params.profileId);

        const user = await requireUser(res, userId);
        if (!user) return;

        const profiles = await db.getPreferenceProfiles(userId);
        if (!profiles.find(p => p.profileId === profileId)) {
            return R.notFound(res, 'PROFILE_NOT_FOUND', `Profile with ID ${profileId} not found for user ${userId}`);
        }

        await db.updateUserById(userId, { activeProfile: profileId });
        const allProfiles = await db.getPreferenceProfiles(userId);

        return R.success(res, { profiles: normalizeProfiles(allProfiles), activeProfile: profileId, links: buildHateoasLinks.preferenceProfilesCollection(userId) }, 'Profile activated successfully');
    } catch (error) { next(error); }
};

export default { updatePreferenceProfile, deletePreferenceProfile, activatePreferenceProfile };
