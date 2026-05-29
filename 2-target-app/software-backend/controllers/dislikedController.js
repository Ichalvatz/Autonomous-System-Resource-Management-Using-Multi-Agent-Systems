/**
 * Disliked Places Controller
 * Manages user disliked places collection
 * @module controllers/dislikedController
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requireUser, requireUserAndPlace } from '../utils/controllerValidators.js';

const getDislikedPlaces = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = await requireUser(res, userId);
        if (!user) return;

        const dislikedPlaces = await db.getDislikedPlaces(userId);
        const dislikedPlacesWithLinks = dislikedPlaces.map(disliked => {
            const place = disliked.place || {};
            return {
                dislikedId: disliked.dislikedId,
                placeId: place.placeId,
                place,
                reviews: disliked.reviews || [],
                links: buildHateoasLinks.dislikedPlace(userId)
            };
        });

        return R.success(res, { dislikedPlaces: dislikedPlacesWithLinks, links: buildHateoasLinks.dislikedPlace(userId) }, 'Disliked places retrieved successfully');
    } catch (error) { next(error); }
};

const addDislikedPlace = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const validation = await requireUserAndPlace(res, userId, req.body.placeId);
        if (!validation) return;

        const newDisliked = await db.addDislikedPlace(userId, req.body.placeId);
        if (!newDisliked) {
            return R.conflict(res, 'PLACE_ALREADY_DISLIKED', "Place is already in user's disliked places", { placeId: req.body.placeId, userId });
        }

        return R.success(res, { dislikedId: newDisliked.dislikedId, placeId: req.body.placeId, links: buildHateoasLinks.dislikedPlace(userId) }, 'Place added to disliked list successfully', 201);
    } catch (error) { next(error); }
};

const removeDislikedPlace = async (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const dislikedId = parseInt(req.params.dislikedId);

        const user = await requireUser(res, userId);
        if (!user) return;

        const removed = await db.removeDislikedPlace(userId, dislikedId);
        if (!removed) {
            return R.notFound(res, 'DISLIKED_NOT_FOUND', `Disliked with ID ${dislikedId} not found for user ${userId}`);
        }

        return R.noContent(res);
    } catch (error) { next(error); }
};

export default { getDislikedPlaces, addDislikedPlace, removeDislikedPlace };
