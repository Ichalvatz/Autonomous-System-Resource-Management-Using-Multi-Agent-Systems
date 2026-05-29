/**
 * Place Write Controller
 * Handles review submission and place reports
 * @module controllers/placeWrite
 */

import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import R from '../utils/responseBuilder.js';
import { requirePlace } from '../utils/controllerValidators.js';

/** Sanitize text by removing HTML and limiting length */
const sanitize = (text, max) => (text || '').toString().trim().replace(/<[^>]*>/g, '').slice(0, max);

/** Check if rating is valid (1-5) */
const validRating = (r) => Number.isInteger(r) && r >= 1 && r <= 5;

const validateRating = (res, body) => {
    if (body.rating === undefined) {
        R.badRequest(res, 'INVALID_REVIEW_DATA', 'Rating required', { field: 'rating' });
        return null;
    }
    const r = Number(body.rating);
    if (!validRating(r)) {
        R.badRequest(res, 'INVALID_REVIEW_DATA', 'Rating must be 1-5', { field: 'rating' });
        return null;
    }
    return r;
};

const submitReview = async (req, res, next) => {
    try {
        const placeId = parseInt(req.params.placeId);
        if (!await requirePlace(res, placeId)) return;

        const rating = validateRating(res, req.body);
        if (rating === null) return;

        const review = await db.addReview({ userId: req.user.userId, placeId, rating, comment: sanitize(req.body.comment, 500) });
        return R.success(res, { review, links: buildHateoasLinks.review(placeId, req.user.userId) }, 'Review submitted', 201);
    } catch (e) { next(e); }
};

const createReport = async (req, res, next) => {
    try {
        const placeId = parseInt(req.params.placeId);
        if (!await requirePlace(res, placeId)) return;

        const desc = (req.body.description || '').trim();
        if (!desc) return R.badRequest(res, 'INVALID_REPORT_DATA', 'Description required', { field: 'description' });

        const report = await db.addReport({ userId: req.user.userId, placeId, description: sanitize(desc, 1000) });
        return R.success(res, { report, links: buildHateoasLinks.report(placeId, req.user.userId) }, 'Report submitted', 201);
    } catch (e) { next(e); }
};

export default { submitReview, createReport };
