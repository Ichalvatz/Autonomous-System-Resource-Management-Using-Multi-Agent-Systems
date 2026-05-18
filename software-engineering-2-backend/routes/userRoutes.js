/**
 * User Management Routes
 */

import express from 'express';
const router = express.Router();
import userController from '../controllers/userController.js';
import { userAuth } from '../middleware/auth.js';

// User profile routes
router.get('/:userId(\\d+)/profile', userAuth, userController.getUserProfile);
router.put('/:userId(\\d+)/profile', userAuth, userController.updateUserProfile);

// User settings routes
router.get('/:userId(\\d+)/settings', userAuth, userController.getSettings);
router.put('/:userId(\\d+)/settings', userAuth, userController.updateSettings);

export default router;
