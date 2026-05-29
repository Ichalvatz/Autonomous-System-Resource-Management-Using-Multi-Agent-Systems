/**
 * Authentication Routes
 * @module routes/authRoutes
 */

import express from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import authController from '../controllers/authController.js';

const router = express.Router();

/** POST /auth/login - Authenticate user */
router.post('/login', authLimiter, [
    body('email').trim().isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
], validate, authController.login);

/** POST /auth/signup - Register new user */
router.post('/signup', authLimiter, [
    body('name').trim().notEmpty().withMessage('Name required').isLength({ max: 100 }),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars')
], validate, authController.signup);

export default router;

