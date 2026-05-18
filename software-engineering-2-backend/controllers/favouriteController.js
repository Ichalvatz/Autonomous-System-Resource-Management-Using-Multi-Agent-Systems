/**
 * Favourite Places Controller
 * Manages user favourite places collection
 * @module controllers/favouriteController
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requireUser, requireUserAndPlace } from '../utils/controllerValidators.js';

export const validateUserAndPlace = requireUserAndPlace;

// Get all favourite places for a user with HATEOAS links
const getFavouritePlaces = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    // Validate user exists
    const user = await requireUser(res, userId);
    if (!user) return;

    const favouritePlaces = await db.getFavouritePlaces(userId);
    // Attach HATEOAS links to each favourite
    const favouritePlacesWithLinks = favouritePlaces.map(fav => {
      const place = fav.place || {};
      return {
        favouriteId: fav.favouriteId,
        placeId: place.placeId,
        place,
        reviews: fav.reviews || [],
        links: buildHateoasLinks.favouriteItem(userId, fav.favouriteId, place.placeId)
      };
    });

    return R.success(res, { favourites: favouritePlacesWithLinks, links: buildHateoasLinks.favouritesCollection(userId) }, 'Favourite places retrieved successfully');
  } catch (error) { next(error); }
};

// Add a place to user's favourites list
const addFavouritePlace = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    // Validate both user and place exist
    const validation = await requireUserAndPlace(res, userId, req.body.placeId);
    if (!validation) return;

    const newFavourite = await db.addFavouritePlace(userId, req.body.placeId);
    // Check if place is already in favourites
    if (!newFavourite) {
      return R.conflict(res, 'PLACE_ALREADY_FAVORITED', "Place is already in user's favorites", { placeId: req.body.placeId, userId });
    }

    const placeObj = validation.place.toObject ? validation.place.toObject() : validation.place;
    const favouritePlace = {
      favouriteId: newFavourite.favouriteId,
      ...placeObj,
      reviews: await db.getReviewsForPlace(req.body.placeId)
    };

    return R.success(res, { favourite: favouritePlace, links: buildHateoasLinks.favourite(userId, newFavourite.favouriteId, req.body.placeId) }, 'Place added to favourites successfully', 201);
  } catch (error) { next(error); }
};

// Remove a place from user's favourites by favouriteId
const removeFavouritePlace = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const favouriteId = parseInt(req.params.favouriteId);

    const user = await requireUser(res, userId);
    if (!user) return;

    // Attempt to remove favourite
    const removed = await db.removeFavouritePlace(userId, favouriteId);
    if (!removed) {
      return R.notFound(res, 'FAVOURITE_NOT_FOUND', `Favourite with ID ${favouriteId} not found for user ${userId}`);
    }

    return R.noContent(res);
  } catch (error) { next(error); }
};

export default { getFavouritePlaces, addFavouritePlace, removeFavouritePlace };
