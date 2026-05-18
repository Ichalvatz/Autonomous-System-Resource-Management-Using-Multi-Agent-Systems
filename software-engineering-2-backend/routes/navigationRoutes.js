/**
 * Navigation Routes
 */

import express from 'express';
const router = express.Router();
import navigationController from '../controllers/navigationController.js';

// Get navigation directions
router.get('/', navigationController.getNavigation);

export default router;
