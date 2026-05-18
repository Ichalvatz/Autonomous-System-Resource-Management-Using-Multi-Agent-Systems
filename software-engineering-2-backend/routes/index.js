/**
 * @fileoverview Central Routes Index
 * @module routes/index
 * 
 * @description
 * Consolidates and exports all route modules for the application.
 * This file serves as the central routing configuration that mounts
 * all API endpoints under their respective base paths.
 * 
 * Route structure:
 * - /auth - Authentication (login, signup, logout)
 * - /users - User profiles and settings
 * - /users - Preference profiles (sub-routes)
 * - /users - Recommendations (sub-routes)
 * - /places - Place information and search
 * - /users - Favourites and dislikes (sub-routes)
 * - /navigation - Turn-by-turn navigation
 * - /admin - Administrative operations
 * 
 * @example
 * // Mount all routes in Express app
 * import routes from './routes/index.js';
 * app.use('/api', routes);
 * 
 * @see {@link module:routes/authRoutes} for authentication endpoints
 * @see {@link module:routes/userRoutes} for user management endpoints
 * @see {@link module:routes/placeRoutes} for place information endpoints
 */

import express from 'express';
// Authentication and admin routes
import { authRoutes, adminRoutes } from './authAdminRoutes.js';
// User-related routes
import { userRoutes, preferenceRoutes, recommendationRoutes, favouriteRoutes } from './userRelatedRoutes.js';
// Place and navigation routes
import { placeRoutes, navigationRoutes } from './placeNavigationRoutes.js';

const router = express.Router();

/** Route configuration: [basePath, routeHandler] */
const routeConfig = [
    ['/auth', authRoutes],
    ['/users', userRoutes],
    ['/users', preferenceRoutes],
    ['/users', recommendationRoutes],
    ['/places', placeRoutes],
    ['/users', favouriteRoutes],
    ['/navigation', navigationRoutes],
    ['/admin', adminRoutes]
];

/** Mount all application routes */
routeConfig.forEach(([path, handler]) => router.use(path, handler));

export default router;
