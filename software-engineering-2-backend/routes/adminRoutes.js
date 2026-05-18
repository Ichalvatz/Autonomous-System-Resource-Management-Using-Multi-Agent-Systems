/**
 * Admin Routes
 */

import express from 'express';
const router = express.Router();
import adminController from '../controllers/adminController.js';
import { adminAuth } from '../middleware/auth.js';

// Generate admin token (for testing - only enabled in development and test mode)
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
	router.post('/auth/generate-token', adminController.generateAdminToken);
}

// Admin routes - protected with adminAuth middleware
router.get('/:adminId(\\d+)/places/:placeId(\\d+)/reports', adminAuth, adminController.getPlaceReports);
router.put('/:adminId(\\d+)/places/:placeId(\\d+)', adminAuth, adminController.updatePlace);

export default router;
