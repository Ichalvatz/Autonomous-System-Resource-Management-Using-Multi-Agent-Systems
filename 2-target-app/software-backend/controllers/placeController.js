/**
 * Place Controller
 * Handles place details, reviews, and search functionality
 * @module controllers/placeController
 */

import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requirePlace } from '../utils/controllerValidators.js';
import placeWrite from './placeWrite.js';

// --- Helper Functions (Private) ---

/** Check if search terms contain injection characters */
const hasInvalidCharacters = (terms) => {
  const injectionPattern = /['";${}]/;
  return terms.some(term => injectionPattern.test(term));
};

/** Enrich places with reviews and HATEOAS links */
const enrichPlacesWithDetails = async (places) => {
  return Promise.all(places.map(async (place) => {
    const placeObj = place.toObject ? place.toObject() : place;
    return {
      ...placeObj,
      reviews: await db.getReviewsForPlace(placeObj.placeId),
      links: buildHateoasLinks.selectLink(placeObj.placeId)
    };
  }));
};

// --- Controllers ---

/** GET /places/:placeId - Retrieve place details with reviews */
const getPlace = async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId);
    const place = await requirePlace(res, placeId);
    if (!place) return;

    const placeWithReviews = {
      ...(place.toObject ? place.toObject() : place),
      reviews: await db.getReviewsForPlace(placeId)
    };
    return R.success(res, { place: placeWithReviews, links: buildHateoasLinks.placeWithWebsite(placeId, place.website) }, 'Place details retrieved successfully');
  } catch (error) { next(error); }
};

const getReviews = async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId);
    const place = await requirePlace(res, placeId);
    if (!place) return;

    return R.success(res, { reviews: await db.getReviewsForPlace(placeId), links: buildHateoasLinks.reviews(placeId) }, 'Reviews retrieved successfully');
  } catch (error) { next(error); }
};

const performSearch = async (req, res, next) => {
  try {
    const keywords = req.query.keywords;
    if (!keywords || keywords.length === 0) {
      return R.success(res, { results: [], searchTerms: [], totalResults: 0, links: buildHateoasLinks.search() }, 'No keywords provided');
    }

    const searchTerms = Array.isArray(keywords) ? keywords : [keywords];

    // Input validation: Reject potential injection characters
    if (hasInvalidCharacters(searchTerms)) {
      return R.badRequest(res, 'INVALID_INPUT', 'Search keywords contain invalid characters');
    }

    const results = await db.searchPlaces(searchTerms);
    const resultsWithDetails = await enrichPlacesWithDetails(results);

    return R.success(res, { results: resultsWithDetails, searchTerms, totalResults: resultsWithDetails.length, links: buildHateoasLinks.search() }, 'Search completed successfully');
  } catch (error) { next(error); }
};

export default { getPlace, getReviews, submitReview: placeWrite.submitReview, createReport: placeWrite.createReport, performSearch };

