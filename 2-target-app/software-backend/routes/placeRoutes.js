/**
 * Places Routes
 */

import express from 'express';
const router = express.Router();
import placeController from '../controllers/placeController.js';
import { userAuth } from '../middleware/auth.js';

// Search route - MUST be before /:placeId to avoid route conflicts
router.get('/search', placeController.performSearch);

// Place details
router.get('/:placeId', placeController.getPlace);

// Reviews routes
router.get('/:placeId/reviews', placeController.getReviews);
router.post('/:placeId/reviews', userAuth, placeController.submitReview);

// Reports routes
router.post('/:placeId/reports', userAuth, placeController.createReport);

export default router;
