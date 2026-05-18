/**
 * Preference Controller
 * Manages user preference profiles
 * @module controllers/preferenceController
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requireUser } from '../utils/controllerValidators.js';
import preferenceCreate from './preferenceCreate.js';
import preferenceModify from './preferenceModify.js';
import { normalizeProfiles } from './preferenceCreate.js';

const getPreferenceProfiles = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = await requireUser(res, userId);
    if (!user) return;

    const profiles = await db.getPreferenceProfiles(userId);
    return R.success(res, { profiles: normalizeProfiles(profiles), links: buildHateoasLinks.preferenceProfilesCollection(userId) }, 'Preference profiles retrieved successfully');
  } catch (error) { next(error); }
};

export default {
  getPreferenceProfiles,
  createPreferenceProfile: preferenceCreate.createPreferenceProfile,
  updatePreferenceProfile: preferenceModify.updatePreferenceProfile,
  deletePreferenceProfile: preferenceModify.deletePreferenceProfile,
  activatePreferenceProfile: preferenceModify.activatePreferenceProfile
};
