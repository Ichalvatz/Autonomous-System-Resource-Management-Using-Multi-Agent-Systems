/**
 * Favourite and Disliked Places Routes
 */

import express from 'express';
const router = express.Router();
import favouriteController from '../controllers/favouriteController.js';
import dislikedController from '../controllers/dislikedController.js';
import { userAuth } from '../middleware/auth.js';

// Favourite places routes
router.get('/:userId(\\d+)/favourite-places', userAuth, favouriteController.getFavouritePlaces);
router.post('/:userId(\\d+)/favourite-places', userAuth, favouriteController.addFavouritePlace);
router.delete('/:userId(\\d+)/favourite-places/:favouriteId(\\d+)', userAuth, favouriteController.removeFavouritePlace);

// Disliked places routes
router.get('/:userId(\\d+)/disliked-places', userAuth, dislikedController.getDislikedPlaces);
router.post('/:userId(\\d+)/disliked-places', userAuth, dislikedController.addDislikedPlace);
router.delete('/:userId(\\d+)/disliked-places/:dislikedId(\\d+)', userAuth, dislikedController.removeDislikedPlace);

export default router;

