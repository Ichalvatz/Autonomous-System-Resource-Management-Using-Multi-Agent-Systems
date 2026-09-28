/**
 * Place Controller - Enhanced with Structured Logging
 * Handles place details, reviews, and search functionality
 * @module controllers/placeController
 *
 * Improvements:
 * - Async operation timing for database queries
 * - Explicit error handling with stack traces
 * - LLM-parseable log output
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

// --- Controllers with Enhanced Logging ---

/**
 * GET /places/:placeId
 * Retrieve place details with reviews
 * Logs: start, database queries, completion
 */
const getPlace = async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId);
    
    // Log database query operation
    const dbQueryStart = Date.now();
    const place = await requirePlace(res, placeId);
    const dbQueryDuration = Date.now() - dbQueryStart;
    req.logAsyncOperation('requirePlace', dbQueryDuration, { placeId });
    
    if (!place) return;

    // Log review fetch operation
    const reviewStart = Date.now();
    const reviews = await db.getReviewsForPlace(placeId);
    const reviewDuration = Date.now() - reviewStart;
    req.logAsyncOperation('getReviewsForPlace', reviewDuration, { placeId, reviewCount: reviews.length });

    const placeWithReviews = {
      ...(place.toObject ? place.toObject() : place),
      reviews
    };
    
    return R.success(
      res,
      {
        place: placeWithReviews,
        links: buildHateoasLinks.placeWithWebsite(placeId, place.website)
      },
      'Place details retrieved successfully'
    );
  } catch (error) {
    // Log error with stack trace
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ERROR] [${req.requestId}] getPlace - Exception caught: ${error.message}`);
    if (error.stack) {
      console.log(`[STACK_TRACE]\n${error.stack}`);
    }
    next(error);
  }
};

/**
 * GET /places/:placeId/reviews
 * Retrieve reviews for a place
 */
const getReviews = async (req, res, next) => {
  try {
    const placeId = parseInt(req.params.placeId);
    
    const dbStart = Date.now();
    const place = await requirePlace(res, placeId);
    const dbDuration = Date.now() - dbStart;
    req.logAsyncOperation('requirePlace', dbDuration, { placeId });
    
    if (!place) return;

    const reviewStart = Date.now();
    const reviews = await db.getReviewsForPlace(placeId);
    const reviewDuration = Date.now() - reviewStart;
    req.logAsyncOperation('getReviewsForPlace', reviewDuration, { placeId, reviewCount: reviews.length });

    return R.success(
      res,
      {
        reviews,
        links: buildHateoasLinks.reviews(placeId)
      },
      'Reviews retrieved successfully'
    );
  } catch (error) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [ERROR] [${req.requestId}] getReviews - Exception caught: ${error.message}`);
    if (error.stack) {
      console.log(`[STACK_TRACE]\n${error.stack}`);
    }
    next(error);
  }
};

/**
 * GET /places/search
 * Search for places by keywords
 *
 * Enhancements:
 * - Logs search query timing
 * - Tracks database performance
 * - Flags slow enrichment operations
 * - Validates input and logs validation errors
 */
const performSearch = async (req, res, next) => {
  try {
    const keywords = req.query.keywords;
    
    // Log search parameters
    const requestId = req.requestId;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] [${requestId}] Performing search - Keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}`);
    
    if (!keywords || keywords.length === 0) {
      console.log(`[${timestamp}] [WARN] [${requestId}] Search with empty keywords - returning empty result`);
      return R.success(
        res,
        {
          results: [],
          searchTerms: [],
          totalResults: 0,
          links: buildHateoasLinks.search()
        },
        'No keywords provided'
      );
    }

    const searchTerms = Array.isArray(keywords) ? keywords : [keywords];

    // Input validation: Reject potential injection characters
    if (hasInvalidCharacters(searchTerms)) {
      console.log(`[${timestamp}] [WARN] [${requestId}] Search query rejected - Invalid characters detected in: ${searchTerms.join(', ')}`);
      return R.badRequest(res, 'INVALID_INPUT', 'Search keywords contain invalid characters');
    }

    // Log database search operation
    const searchStart = Date.now();
    const results = await db.searchPlaces(searchTerms);
    const searchDuration = Date.now() - searchStart;
    req.logAsyncOperation('searchPlaces', searchDuration, {
      keywords: searchTerms,
      resultCount: results.length
    });

    // Log enrichment operation (can be slow with many results)
    const enrichStart = Date.now();
    const resultsWithDetails = await enrichPlacesWithDetails(results);
    const enrichDuration = Date.now() - enrichStart;
    req.logAsyncOperation('enrichPlacesWithDetails', enrichDuration, {
      resultCount: resultsWithDetails.length,
      avgTimePerResult: (enrichDuration / resultsWithDetails.length).toFixed(2)
    });

    console.log(`[${timestamp}] [INFO] [${requestId}] Search completed successfully - Found ${resultsWithDetails.length} results`);

    return R.success(
      res,
      {
        results: resultsWithDetails,
        searchTerms,
        totalResults: resultsWithDetails.length,
        links: buildHateoasLinks.search()
      },
      'Search completed successfully'
    );
  } catch (error) {
    const timestamp = new Date().toISOString();
    const requestId = req.requestId;
    console.log(`[${timestamp}] [ERROR] [${requestId}] performSearch - Exception caught: ${error.message}`);
    if (error.stack) {
      console.log(`[STACK_TRACE]\n${error.stack}`);
    }
    next(error);
  }
};

export default {
  getPlace,
  getReviews,
  submitReview: placeWrite.submitReview,
  createReport: placeWrite.createReport,
  performSearch
};
