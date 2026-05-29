/**
 * Admin Controller
 * Handles admin operations for places and reports
 * @module controllers/adminController
 */
import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import jwt from 'jsonwebtoken';
import R from '../utils/responseBuilder.js';
import { requirePlace } from '../utils/controllerValidators.js';

// --- Helper Functions (Private) ---

/** Allowed fields for place updates */
const ALLOWED_PLACE_FIELDS = ['name', 'description', 'category', 'website'];

/** Prepare update DTO from request body, picking only allowed fields */
const preparePlaceUpdateDTO = (body, existingLocation) => {
  const updateData = {};
  ALLOWED_PLACE_FIELDS.forEach(k => { if (body[k]) updateData[k] = body[k]; });
  if (body.location) updateData.location = { ...existingLocation, ...body.location };
  return updateData;
};

/** Add HATEOAS links to each report */
const enrichReportsWithLinks = (reports, placeId, adminId) => {
  return reports.map(report => {
    const reportObj = report.toObject ? report.toObject() : report;
    return { ...reportObj, links: buildHateoasLinks.adminReport(placeId, adminId) };
  });
};

// --- Controllers ---

const getPlaceReports = async (req, res, next) => {
  try {
    const adminId = parseInt(req.params.adminId);
    const placeId = parseInt(req.params.placeId);

    const place = await requirePlace(res, placeId);
    if (!place) return;

    const placeReports = await db.getReportsForPlace(placeId);
    const reportsWithLinks = enrichReportsWithLinks(placeReports, placeId, adminId);

    return R.success(res, { reports: reportsWithLinks, totalReports: reportsWithLinks.length, links: buildHateoasLinks.adminReportsCollection(adminId, placeId) }, 'Place reports retrieved successfully');
  } catch (error) { next(error); }
};

const updatePlace = async (req, res, next) => {
  try {
    const adminId = parseInt(req.params.adminId);
    const placeId = parseInt(req.params.placeId);

    const place = await requirePlace(res, placeId);
    if (!place) return;

    const placeObj = place.toObject ? place.toObject() : place;
    const updateData = preparePlaceUpdateDTO(req.body, placeObj.location);

    const updatedPlace = await db.updatePlace(placeId, updateData);
    const updatedPlaceObj = updatedPlace.toObject ? updatedPlace.toObject() : updatedPlace;
    const placeWithReviews = { ...updatedPlaceObj, reviews: await db.getReviewsForPlace(placeId) };

    return R.success(res, { place: placeWithReviews, links: buildHateoasLinks.adminPlace(placeId, adminId) }, 'Place updated successfully');
  } catch (error) { next(error); }
};

const generateAdminToken = (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return R.forbidden(res, 'DISABLED_IN_PRODUCTION', 'Admin token generation endpoint is disabled in production.');
    }

    const { username, password } = req.body || {};
    const validUser = process.env.ADMIN_DEV_USER || 'admin';
    const validPass = process.env.ADMIN_DEV_PASS || 'admin123';

    if (username !== validUser || password !== validPass) {
      return R.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid admin credentials for token generation.');
    }

    const token = jwt.sign({ userId: 1001, role: 'admin', name: 'Admin User' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return R.success(res, { token, adminId: 1001, expiresIn: '24 hours', usage: 'Include this token in Authorization header as: Bearer <token>' }, 'Admin token generated successfully (development only)');
  } catch (error) { next(error); }
};

export default { getPlaceReports, updatePlace, generateAdminToken };

