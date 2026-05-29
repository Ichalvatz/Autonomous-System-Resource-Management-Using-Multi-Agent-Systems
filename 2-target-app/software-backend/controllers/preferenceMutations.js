/**
 * Preference Profile Mutations Controller
 * Re-exports from split modules for backwards compatibility
 */

import preferenceCreate from './preferenceCreate.js';
import preferenceModify from './preferenceModify.js';
export { normalizeProfiles, VALID_CATEGORIES } from './preferenceCreate.js';

export default {
    createPreferenceProfile: preferenceCreate.createPreferenceProfile,
    updatePreferenceProfile: preferenceModify.updatePreferenceProfile,
    deletePreferenceProfile: preferenceModify.deletePreferenceProfile,
    activatePreferenceProfile: preferenceModify.activatePreferenceProfile
};
