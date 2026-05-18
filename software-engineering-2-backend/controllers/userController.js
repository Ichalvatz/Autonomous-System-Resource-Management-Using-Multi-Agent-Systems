/**
 * User Management Controller
 * Handles HTTP requests for user profile and settings operations
 */

import * as userService from '../services/userService.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';

/**
 * Get user profile
 * GET /users/:userId/profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getUserProfile = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = await userService.getUserProfile(userId);
    
    res.json({
      success: true,
      data: {
        user,
        links: buildHateoasLinks.userProfile(userId)
      },
      message: 'User profile retrieved successfully',
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 * PUT /users/:userId/profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const updateUserProfile = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const updatedUser = await userService.updateUserProfile(userId, req.body);
    
    res.json({
      success: true,
      data: {
        user: updatedUser,
        links: buildHateoasLinks.userProfile(userId)
      },
      message: 'User profile updated successfully',
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user settings
 * GET /users/:userId/settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getSettings = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const settings = await userService.getUserSettings(userId);
    
    res.json({
      success: true,
      data: {
        settings,
        links: buildHateoasLinks.settings(userId)
      },
      message: 'User settings retrieved successfully',
      error: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user settings
 * PUT /users/:userId/settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const updateSettings = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const updatedSettings = await userService.updateUserSettings(userId, req.body);
    
    res.json({
      success: true,
      data: {
        settings: updatedSettings,
        links: buildHateoasLinks.settings(userId)
      },
      message: 'User settings updated successfully',
      error: null
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getUserProfile,
  updateUserProfile,
  getSettings,
  updateSettings
};

