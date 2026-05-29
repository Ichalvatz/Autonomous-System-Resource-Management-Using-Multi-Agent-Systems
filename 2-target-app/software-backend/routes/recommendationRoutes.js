/**
 * Recommendations Routes
 */

import express from 'express';
const router = express.Router();
import recommendationController from '../controllers/recommendationController.js';
import { userAuth } from '../middleware/auth.js';

// Get personalized recommendations
router.get('/:userId/recommendations', userAuth, recommendationController.getRecommendations);

export default router;
