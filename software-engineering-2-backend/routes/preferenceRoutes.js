/**
 * Preference Profiles Routes
 */

import express from 'express';
const router = express.Router();
import preferenceController from '../controllers/preferenceController.js';
import { userAuth } from '../middleware/auth.js';

// Preference profiles collection routes
router.get('/:userId(\\d+)/preference-profiles', userAuth, preferenceController.getPreferenceProfiles);
router.post('/:userId(\\d+)/preference-profiles', userAuth, preferenceController.createPreferenceProfile);

// Individual preference profile routes
router.post('/:userId(\\d+)/preference-profiles/:profileId(\\d+)/activate', userAuth, preferenceController.activatePreferenceProfile);
router.put('/:userId(\\d+)/preference-profiles/:profileId(\\d+)', userAuth, preferenceController.updatePreferenceProfile);
router.delete('/:userId(\\d+)/preference-profiles/:profileId(\\d+)', userAuth, preferenceController.deletePreferenceProfile);

export default router;
